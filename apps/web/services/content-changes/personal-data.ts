import { FeedbackModel } from "./models";

/** Used by account deletion without importing HTTP/session initialization. */
export async function deleteUserFeedback(domain: string, userId: string) {
    await FeedbackModel.deleteMany({ domain, "actor.userId": userId });
}
