import { DripChangeModel } from "./models";
import { requireAccountErasureReady } from "../../../../packages/common-logic/src/account-lifecycle/gate";

export async function deleteUserDripChanges(domainId: string, userId: string) {
    await requireAccountErasureReady({ domainId, userId });
    // Retain only unsettled pseudonymous operation IDs until an administrator can
    // reconcile them; deleting the lock could allow a competing native write.
    await DripChangeModel.deleteMany({
        domain: domainId,
        preparedBy: userId,
        activeCourse: { $exists: false },
    });
}
export async function deleteCourseDripChanges(
    domainId: string,
    courseId: string,
) {
    await DripChangeModel.deleteMany({ domain: domainId, courseId });
}
export async function deleteTenantDripChanges(domainId: string) {
    await DripChangeModel.deleteMany({ domain: domainId });
}
