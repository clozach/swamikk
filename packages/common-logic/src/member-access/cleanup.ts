import { MembershipAccessModel } from "./models";
import { requireAccountErasureReady } from "../account-lifecycle/gate";
import { PurchaseAccessModel } from "../purchase-access/model";

/** Access grants belong to the deleted account, not to recoverable financial records. */
export async function deleteUserMemberAccess(
    domainId: string,
    userId: string,
): Promise<void> {
    await requireAccountErasureReady({ domainId, userId });
    await MembershipAccessModel.deleteMany({ domain: domainId, userId });
    await PurchaseAccessModel.deleteMany({ domain: domainId, userId });
}
export async function deleteTenantMemberAccess(
    domainId: string,
): Promise<void> {
    await MembershipAccessModel.deleteMany({ domain: domainId });
    await PurchaseAccessModel.deleteMany({ domain: domainId });
}

export async function deleteCourseMemberAccess(
    domainId: string,
    courseId: string,
): Promise<void> {
    await MembershipAccessModel.deleteMany({ domain: domainId, courseId });
    await PurchaseAccessModel.deleteMany({ domain: domainId, courseId });
}
