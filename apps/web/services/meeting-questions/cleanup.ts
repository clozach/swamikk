import { requireAccountErasureReady } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { MeetingQuestionAnswerModel, MeetingQuestionSetModel } from "./models";

/** Shared meeting decisions remain; erasure removes their account association. */
export async function redactMeetingQuestionAuthor(
    domainId: string,
    userId: string,
) {
    await requireAccountErasureReady({ domainId, userId });
    return MeetingQuestionAnswerModel.updateMany(
        { domain: domainId, authorId: userId },
        { $unset: { authorId: 1 } },
    );
}

/** Offline tenant teardown only: stop tenant traffic/writes before calling. */
export async function deleteTenantMeetingQuestions(domainId: string) {
    await MeetingQuestionAnswerModel.deleteMany({ domain: domainId });
    await MeetingQuestionSetModel.deleteMany({ domain: domainId });
}
