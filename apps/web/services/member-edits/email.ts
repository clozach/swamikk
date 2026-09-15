import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import type {
    MemberEditInput,
    MemberEditResult,
    MemberEmailResult,
    MemberEmailVerification,
} from "@courselit/common-models";
import UserModel from "@/models/User";
import { sanitizeEmail } from "@/lib/sanitize-email";
import {
    ContentChangeError,
    requireCondition,
} from "@/services/content-changes/errors";
import { type MimicEditor, refreshSubject } from "./context";
import { MemberEditModel } from "./model";
import {
    failStale,
    type MemberEditRow,
    recordEdit,
    settleEdit,
    withEditorReservation,
} from "./rows";
import { readMemberEditSnapshot } from "./snapshot";
import { pendingView, view } from "./view";
import { sendCode } from "./email-delivery";
import { settleAppliedEdit } from "./recovery";

export const EMAIL_CODE_TTL_MS = 10 * 60_000;
export const EMAIL_CODE_ATTEMPTS = 5;
export const EMAIL_CODE_RESENDS = 3;
const NOT_PENDING = "No email change is waiting for a code.";

const hashCode = (salt: string, code: string) =>
    createHash("sha256").update(`${salt}${code}`).digest("hex");
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** The current address and the BEFORE of every applied email row: addresses the account has held. */
export async function knownAddresses(
    editor: MimicEditor,
): Promise<Set<string>> {
    const rows = await MemberEditModel.find(
        {
            domain: editor.domain._id,
            subjectUserId: editor.subject.userId,
            state: "applied",
            "changes.field": "email",
        },
        { changes: 1 },
    ).lean();
    const known = new Set([sanitizeEmail(editor.subject.email)]);
    for (const row of rows)
        for (const change of row.changes)
            if (change.field === "email")
                known.add(sanitizeEmail(change.before));
    return known;
}

function assertEmailEditable(editor: MimicEditor) {
    requireCondition(
        editor.subject.userId !== editor.actor.userId,
        "forbidden",
        "Your own sign-in email cannot be changed from Member Mimic.",
        403,
    );
    requireCondition(
        editor.subject.email !== editor.domain.email,
        "forbidden",
        "The site owner's sign-in email cannot be changed from Member Mimic.",
        403,
    );
}

/** Any other account in the tenant, active or not, that holds the address. */
async function assertAddressFree(editor: MimicEditor, address: string) {
    const holder = await UserModel.exists({
        domain: editor.domain._id,
        email: address,
        _id: { $ne: editor.subject._id },
    });
    requireCondition(
        !holder,
        "conflict",
        "That address already belongs to another account.",
        409,
    );
}

async function applyEmailRow(
    editor: MimicEditor,
    headers: Headers,
    entry: MemberEditRow,
    verification: MemberEmailVerification,
): Promise<Extract<MemberEditResult, { kind: "applied" }>> {
    const change = entry.changes.find((item) => item.field === "email");
    requireCondition(change, "bad_request", "Invalid email change.");
    await withEditorReservation(editor, async () => {
        let saved: unknown;
        try {
            // `emailVerified` is Better Auth's field, absent from the schema.
            saved = await UserModel.findOneAndUpdate(
                {
                    _id: editor.subject._id,
                    domain: editor.domain._id,
                    email: change.before,
                },
                {
                    $set: { email: change.after, emailVerified: true },
                    $addToSet: { memberEditReceipts: entry.editId },
                },
                { new: true, timestamps: false, strict: false },
            );
        } catch (err) {
            if ((err as { code?: number }).code !== 11000) throw err;
            await settleEdit(entry, {
                state: "failed",
                reason: "That address already belongs to another account.",
            });
            throw new ContentChangeError(
                "conflict",
                "That address already belongs to another account.",
                409,
            );
        }
        if (!saved)
            await failStale(
                entry,
                "The member's sign-in email changed while saving.",
            );
        await settleAppliedEdit(editor, entry, headers);
    });
    return {
        kind: "applied",
        edit: view({ ...entry.toObject(), emailVerification: verification }),
        snapshot: await readMemberEditSnapshot(await refreshSubject(editor)),
    };
}

/**
 * An address the account already held needs no code (which is how undo and
 * restore work for email). A never-held address gets a hashed six-digit code
 * mailed to it and a pending row; the change lands on confirm.
 */
export async function proposeEmailChange(
    editor: MimicEditor,
    headers: Headers,
    input: MemberEditInput,
): Promise<MemberEditResult> {
    return withEditorReservation(editor, () =>
        proposeEmailChangeReserved(editor, headers, input),
    );
}

async function proposeEmailChangeReserved(
    editor: MimicEditor,
    headers: Headers,
    input: MemberEditInput,
): Promise<MemberEditResult> {
    const change = input.changes.find((item) => item.field === "email");
    requireCondition(change, "bad_request", "Invalid email change.");
    assertEmailEditable(editor);
    await assertAddressFree(editor, change.after);
    if ((await knownAddresses(editor)).has(sanitizeEmail(change.after))) {
        const verification: MemberEmailVerification = {
            kind: "previously-held",
        };
        const entry = await recordEdit(editor, input, "applying", {
            emailVerification: verification,
            emailEffects: "pending",
        });
        return applyEmailRow(editor, headers, entry, verification);
    }
    const code = newCode();
    const codeSalt = randomBytes(16).toString("hex");
    // One live pending per member and editor: a newer proposal supersedes.
    await MemberEditModel.updateMany(
        {
            domain: editor.domain._id,
            subjectUserId: editor.subject.userId,
            editorUserId: editor.actor.userId,
            state: "pending",
        },
        { $set: { state: "failed", failureReason: "superseded" } },
    );
    const entry = await recordEdit(editor, input, "pending", {
        codeHash: hashCode(codeSalt, code),
        codeSalt,
        attempts: 0,
        resends: 0,
        expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
    });
    try {
        await sendCode(headers, change.after, code);
    } catch (err) {
        await settleEdit(entry, {
            state: "failed",
            reason: "The code could not be sent.",
        });
        throw err;
    }
    return {
        kind: "verify",
        pending: pendingView(entry.toObject()),
        snapshot: await readMemberEditSnapshot(editor),
    };
}

async function pendingRow(editor: MimicEditor, pendingId: string) {
    const row = await MemberEditModel.findOne({
        domain: editor.domain._id,
        editId: pendingId,
        subjectUserId: editor.subject.userId,
        editorUserId: editor.actor.userId,
        state: "pending",
    });
    requireCondition(row, "not_found", NOT_PENDING, 404);
    return row;
}

async function expired(
    editor: MimicEditor,
    row: MemberEditRow,
    reason: string,
): Promise<Extract<MemberEmailResult, { kind: "expired" }>> {
    const settled = await MemberEditModel.updateOne(
        {
            _id: row._id,
            state: "pending",
            codeHash: row.codeHash,
            attempts: row.attempts,
            expiresAt: row.expiresAt,
        },
        { $set: { state: "failed", failureReason: reason } },
    );
    requireCondition(
        settled.matchedCount === 1,
        "unsettled",
        "This email change was updated. Reload and try again.",
        409,
    );
    return { kind: "expired", snapshot: await readMemberEditSnapshot(editor) };
}

const isExpired = (row: MemberEditRow) =>
    !row.expiresAt || row.expiresAt.getTime() <= Date.now();

export async function confirmEmailChange(
    editor: MimicEditor,
    headers: Headers,
    pendingId: string,
    code: string,
): Promise<MemberEmailResult> {
    const row = await pendingRow(editor, pendingId);
    if (isExpired(row)) return expired(editor, row, "expired");
    if ((row.attempts ?? 0) >= EMAIL_CODE_ATTEMPTS)
        return expired(editor, row, "attempts");
    const expected = Buffer.from(row.codeHash || "", "hex");
    const actual = Buffer.from(hashCode(row.codeSalt || "", code), "hex");
    const matches =
        expected.length > 0 &&
        expected.length === actual.length &&
        timingSafeEqual(Uint8Array.from(expected), Uint8Array.from(actual));
    if (!matches) {
        const bumped = await MemberEditModel.findOneAndUpdate(
            {
                _id: row._id,
                state: "pending",
                codeHash: row.codeHash,
                attempts: row.attempts,
                expiresAt: { $gt: new Date() },
            },
            { $inc: { attempts: 1 } },
            { new: true },
        );
        requireCondition(
            bumped,
            "unsettled",
            "This email change was updated. Reload and try again.",
            409,
        );
        const attempts = bumped.attempts ?? EMAIL_CODE_ATTEMPTS;
        if (attempts >= EMAIL_CODE_ATTEMPTS)
            return expired(editor, bumped, "attempts");
        return {
            kind: "wrong-code",
            attemptsLeft: EMAIL_CODE_ATTEMPTS - attempts,
        };
    }
    // Claim the row: a second confirm with the same code finds nothing pending.
    const claimed = await MemberEditModel.findOneAndUpdate(
        {
            _id: row._id,
            state: "pending",
            codeHash: row.codeHash,
            attempts: row.attempts,
            expiresAt: { $gt: new Date() },
        },
        {
            $set: {
                state: "applying",
                emailVerification: { kind: "code-to-new-address" },
                emailEffects: "pending",
            },
        },
        { new: true },
    );
    requireCondition(claimed, "not_found", NOT_PENDING, 404);
    const change = claimed.changes.find((item) => item.field === "email");
    requireCondition(change, "bad_request", "Invalid email change.");
    try {
        assertEmailEditable(editor);
        await assertAddressFree(editor, change.after);
    } catch (err) {
        await settleEdit(claimed, {
            state: "failed",
            reason: (err as Error).message,
        });
        throw err;
    }
    return applyEmailRow(editor, headers, claimed, {
        kind: "code-to-new-address",
    });
}

export async function resendEmailCode(
    editor: MimicEditor,
    headers: Headers,
    pendingId: string,
): Promise<MemberEmailResult> {
    const row = await pendingRow(editor, pendingId);
    if (isExpired(row)) return expired(editor, row, "expired");
    requireCondition(
        (row.resends ?? 0) < EMAIL_CODE_RESENDS,
        "resend_limit",
        "The code was already sent three times. Cancel and propose the change again.",
    );
    const change = row.changes.find((item) => item.field === "email");
    requireCondition(change, "bad_request", "Invalid email change.");
    const code = newCode();
    const codeSalt = randomBytes(16).toString("hex");
    const updated = await MemberEditModel.findOneAndUpdate(
        {
            _id: row._id,
            state: "pending",
            codeHash: row.codeHash,
            resends: row.resends ?? 0,
            expiresAt: { $gt: new Date() },
        },
        {
            $set: {
                codeHash: hashCode(codeSalt, code),
                codeSalt,
                attempts: 0,
                expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
            },
            $inc: { resends: 1 },
        },
        { new: true },
    );
    requireCondition(updated, "not_found", NOT_PENDING, 404);
    await sendCode(headers, change.after, code);
    return { kind: "resent", pending: pendingView(updated.toObject()) };
}

export async function cancelEmailChange(
    editor: MimicEditor,
    pendingId: string,
): Promise<MemberEmailResult> {
    const row = await MemberEditModel.findOneAndUpdate(
        {
            domain: editor.domain._id,
            editId: pendingId,
            subjectUserId: editor.subject.userId,
            editorUserId: editor.actor.userId,
            state: "pending",
        },
        { $set: { state: "failed", failureReason: "cancelled" } },
    );
    requireCondition(row, "not_found", NOT_PENDING, 404);
    return {
        kind: "cancelled",
        snapshot: await readMemberEditSnapshot(editor),
    };
}
