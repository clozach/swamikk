import { MemberEditModel } from "./model";

/** Account erasure: the history is for a living account. */
export async function purgeMemberEdits(domain: string, userId: string) {
    await MemberEditModel.deleteMany({ domain, subjectUserId: userId });
}

/** Stop tenant requests before removing its records. */
export async function deleteTenantMemberEdits(domain: string) {
    await MemberEditModel.deleteMany({ domain });
}
