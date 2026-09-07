import { MembershipAccessModel } from "./models";

/** Access grants belong to the deleted account, not to recoverable financial records. */
export async function deleteUserMemberAccess(
    domainId: string,
    userId: string,
): Promise<void> {
    await MembershipAccessModel.deleteMany({ domain: domainId, userId });
}
export async function deleteTenantMemberAccess(
    domainId: string,
): Promise<void> {
    await MembershipAccessModel.deleteMany({ domain: domainId });
}

export async function deleteCourseMemberAccess(
    domainId: string,
    courseId: string,
): Promise<void> {
    await MembershipAccessModel.deleteMany({ domain: domainId, courseId });
}
