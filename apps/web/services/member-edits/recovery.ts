import UserModel from "@/models/User";
import { ContactPreferencesModel } from "@/services/contact-preferences/model";
import { requireCondition } from "@/services/content-changes/errors";
import { error as logError } from "@/services/logger";
import type { MimicEditor } from "./context";
import { sendNotice } from "./email-delivery";
import { MemberEditModel } from "./model";
import { type MemberEditRow, settleEdit } from "./rows";
import { revokeMemberSessions } from "./sessions";

/** The edit and its receipt reach one document atomically. History is settled before receipt removal. */
export async function settleAppliedEdit(
    editor: MimicEditor,
    entry: MemberEditRow,
    headers: Headers,
) {
    if (entry.state === "applying")
        await settleEdit(entry, { state: "applied" });
    requireCondition(
        entry.state === "applied",
        "unsettled",
        "This edit is still finishing.",
        409,
    );
    const email = entry.changes.find((change) => change.field === "email");
    if (email && entry.emailEffects !== "complete") {
        // Session revocation is idempotent. The durable receipt retries a failed
        // notification; a lost enqueue acknowledgement may send the notice twice.
        await revokeMemberSessions(editor.domain._id, editor.subject._id);
        try {
            await sendNotice(
                headers,
                email.before,
                email,
                entry.editId,
                entry.at,
            );
        } catch {
            logError("Member edit notice awaits retry", {
                editId: entry.editId,
            });
            return;
        }
        await MemberEditModel.updateOne(
            { _id: entry._id, state: "applied" },
            { $set: { emailEffects: "complete" } },
        );
        entry.emailEffects = "complete";
    }
    const contact = entry.changes.every(
        (change) => change.field !== "name" && change.field !== "email",
    );
    const filter = { domain: editor.domain._id, userId: editor.subject.userId };
    const update = { $pull: { memberEditReceipts: entry.editId } };
    if (contact) await ContactPreferencesModel.updateOne(filter, update);
    else await UserModel.updateOne(filter, update, { timestamps: false });
}

/** Safe after a write threw, or after the process exited before history settled. */
export async function recoverMemberReceipts(
    editor: MimicEditor,
    headers: Headers,
) {
    const filter = { domain: editor.domain._id, userId: editor.subject.userId };
    const [user, contact] = await Promise.all([
        UserModel.findOne(filter).select("+memberEditReceipts").lean(),
        ContactPreferencesModel.findOne(filter)
            .select("+memberEditReceipts")
            .lean(),
    ]);
    const userRecord = user as { memberEditReceipts?: string[] } | null;
    const ids = Array.from(
        new Set<string>([
            ...(userRecord?.memberEditReceipts || []),
            ...(contact?.memberEditReceipts || []),
        ]),
    );
    if (!ids.length) return;
    const rows = await MemberEditModel.find({
        domain: editor.domain._id,
        subjectUserId: editor.subject.userId,
        editId: { $in: ids },
    });
    for (const row of rows) await settleAppliedEdit(editor, row, headers);
}
