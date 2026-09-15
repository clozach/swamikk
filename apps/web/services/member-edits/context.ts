import type { MemberMimicContext } from "@courselit/common-models";
import type { InternalUser } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import type { Domain } from "@/models/Domain";
import UserModel from "@/models/User";
import { requireCondition } from "@/services/content-changes/errors";
import { resolveMemberReadContext } from "@/services/member-mimic/context";
import { recoverMemberReceipts } from "./recovery";
import { withEditorReservation } from "./rows";

/**
 * The two identities of an edit made from Member Mimic: the admin whose
 * session carries the request (`actor`, the recorded editor) and the member
 * the view is of (`subject`, loaded fresh from the users collection — never
 * the read-only projection the mimic context carries).
 */
export interface MimicEditor {
    actor: InternalUser;
    subject: InternalUser;
    mimic: MemberMimicContext;
    domain: Domain;
}

export async function requireMimicEditor(
    headers: Headers,
    ctx: GQLContext,
): Promise<MimicEditor> {
    const resolved = await resolveMemberReadContext(headers, ctx);
    requireCondition(
        resolved.kind !== "ordinary",
        "forbidden",
        "Open Member Mimic to edit a member.",
        403,
    );
    requireCondition(
        resolved.kind === "mimic",
        "mimic_expired",
        "Member Mimic has expired. Exit and start again.",
        403,
    );
    const mimic = resolved.context.memberMimic;
    const actor = resolved.context.actor;
    requireCondition(
        mimic && actor,
        "mimic_expired",
        "Member Mimic has expired. Exit and start again.",
        403,
    );
    const subject = await UserModel.findOne({
        domain: ctx.subdomain._id,
        userId: mimic.subjectUserId,
        active: true,
    });
    requireCondition(
        subject,
        "not_found",
        "This member is unavailable or cannot currently sign in.",
        404,
    );
    const editor = { actor, subject, mimic, domain: ctx.subdomain };
    await withEditorReservation(editor, () =>
        recoverMemberReceipts(editor, headers),
    );
    return editor;
}

/** The subject re-read after a write, so a returned snapshot is the record. */
export async function refreshSubject(
    editor: MimicEditor,
): Promise<MimicEditor> {
    const subject = await UserModel.findOne({
        domain: editor.domain._id,
        userId: editor.mimic.subjectUserId,
        active: true,
    });
    requireCondition(
        subject,
        "not_found",
        "This member is unavailable or cannot currently sign in.",
        404,
    );
    return { ...editor, subject };
}
