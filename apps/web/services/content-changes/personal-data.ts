import { FeedbackModel } from "./models";
import { requireAccountErasureReady } from "../../../../packages/common-logic/src/account-lifecycle/gate";

/** Used by account deletion without importing HTTP/session initialization. */
export async function deleteUserFeedback(domain: string, userId: string) {
    await requireAccountErasureReady({ domainId: domain, userId });
    await FeedbackModel.deleteMany({ domain, "actor.userId": userId });
}
