import type {
    MemberEditField,
    MemberEditSnapshot,
} from "@courselit/common-models";
import { UIConstants } from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";
import { requireCondition } from "@/services/content-changes/errors";
import { ContactPreferencesModel } from "@/services/contact-preferences/model";
import type { MimicEditor } from "./context";
import { MemberEditModel } from "./model";
import { pendingView } from "./view";

/** The stored value of every editable field, read fresh. */
export type MemberRecordValues = Record<MemberEditField, string> & {
    revision: number;
};

export async function readMemberRecordValues(
    editor: MimicEditor,
): Promise<MemberRecordValues> {
    const { subject, domain } = editor;
    const record = await ContactPreferencesModel.findOne({
        domain: domain._id,
        userId: subject.userId,
    }).lean();
    requireCondition(
        !record || record.state === "active",
        "forbidden",
        "This account is being removed.",
        403,
    );
    const contact =
        record?.state === "active"
            ? record.contact
            : { kind: "email" as const, value: subject.email };
    return {
        name: subject.name || "",
        email: subject.email,
        "contact.kind": contact.kind,
        "contact.value": contact.value,
        checkIns: record?.state === "active" ? record.checkIns : "none",
        revision: record?.state === "active" ? record.revision : 0,
    };
}

export async function readMemberEditSnapshot(
    editor: MimicEditor,
): Promise<MemberEditSnapshot> {
    const { actor, subject, domain } = editor;
    const values = await readMemberRecordValues(editor);
    const pending = await MemberEditModel.findOne({
        domain: domain._id,
        subjectUserId: subject.userId,
        editorUserId: actor.userId,
        state: "pending",
        expiresAt: { $gt: new Date() },
    })
        .sort({ at: -1, editId: 1 })
        .lean();
    const emailLock =
        subject.userId === actor.userId
            ? "self"
            : subject.email === domain.email
              ? "owner"
              : undefined;
    const pendingEffects = await MemberEditModel.exists({
        domain: domain._id,
        subjectUserId: subject.userId,
        state: "applied",
        emailEffects: "pending",
    });
    return {
        subject: {
            userId: subject.userId,
            name: values.name,
            email: values.email,
        },
        contact: {
            kind: values[
                "contact.kind"
            ] as MemberEditSnapshot["contact"]["kind"],
            value: values["contact.value"],
            checkIns:
                values.checkIns as MemberEditSnapshot["contact"]["checkIns"],
            revision: values.revision,
        },
        ...(emailLock ? { emailLock } : {}),
        actor: {
            userId: actor.userId,
            name: actor.name || actor.email,
            canReviewRefunds: checkPermission(actor.permissions, [
                UIConstants.permissions.manageSettings,
            ]),
        },
        ...(pending ? { pendingEmail: pendingView(pending) } : {}),
        ...(pendingEffects ? { emailEffects: "pending" as const } : {}),
    };
}
