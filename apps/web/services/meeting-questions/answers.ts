import { requireFeedbackAdmin } from "../content-changes/http";
import { randomUUID } from "crypto";
import type {
    MeetingAnswerInput,
    MeetingAnswerSaveResult,
} from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import type { InternalMeetingQuestionAnswer } from "@courselit/orm-models";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { requireCondition } from "../content-changes/errors";
import { MeetingQuestionSetModel, MeetingQuestionAnswerModel } from "./models";
import { answerView, meetingViewer } from "./views";

function priorResult(
    input: MeetingAnswerInput,
    record: InternalMeetingQuestionAnswer | null,
    ctx: GQLContext,
): MeetingAnswerSaveResult | null {
    const prior = record?.history.find(
        (entry) => entry.mutationId === input.mutationId,
    );
    const authors = new Map([[ctx.user.userId, meetingViewer(ctx)]]);
    if (prior && record) {
        if (
            prior.text === input.text &&
            prior.baseRevision === input.expectedRevision
        )
            return {
                kind: "saved",
                answer: answerView(record, authors),
                replayed: true,
                appliedRevision: prior.revision,
            };
        return {
            kind: "conflict",
            current: answerView(record, authors),
            message:
                "That save ID was already used for different text. Reload before trying again.",
        };
    }
    if ((record?.revision || 0) !== input.expectedRevision)
        return {
            kind: "conflict",
            current: record ? answerView(record, authors) : null,
            message:
                "Your answer changed in another window. Your draft is kept; reload the saved answer before choosing what to save.",
        };
    return null;
}

export async function saveMeetingAnswer(
    input: MeetingAnswerInput,
    ctx: GQLContext,
): Promise<MeetingAnswerSaveResult> {
    requireFeedbackAdmin(ctx);
    return withAccountWrite(
        {
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            purpose: "meeting-question-answer",
        },
        async () => {
            await MeetingQuestionAnswerModel.init();
            const key = {
                domain: ctx.subdomain._id,
                setId: input.setId,
                questionId: input.questionId,
                authorId: ctx.user.userId,
            };
            requireCondition(
                await MeetingQuestionSetModel.exists({
                    domain: key.domain,
                    id: input.setId,
                    "questions.id": input.questionId,
                }),
                "not_found",
                "Meeting question not found.",
                404,
            );
            const current = await MeetingQuestionAnswerModel.findOne(key);
            const prior = priorResult(input, current, ctx);
            if (prior) return prior;
            requireCondition(
                (current?.history.length || 0) < 500,
                "history_full",
                "This answer has reached its retained revision limit. Existing answers and history are unchanged.",
                409,
            );
            const revision = input.expectedRevision + 1;
            const entry = {
                revision,
                baseRevision: input.expectedRevision,
                mutationId: input.mutationId,
                text: input.text,
                at: new Date().toISOString(),
            };
            let saved: InternalMeetingQuestionAnswer | null = null;
            if (!current) {
                try {
                    saved = await MeetingQuestionAnswerModel.create({
                        ...key,
                        id: randomUUID(),
                        text: input.text,
                        revision,
                        history: [entry],
                    });
                } catch (error) {
                    if (
                        !(error instanceof Error) ||
                        !("code" in error) ||
                        error.code !== 11000
                    )
                        throw error;
                }
            } else {
                saved = await MeetingQuestionAnswerModel.findOneAndUpdate(
                    {
                        ...key,
                        revision: input.expectedRevision,
                        "history.mutationId": { $ne: input.mutationId },
                    },
                    {
                        $set: { text: input.text, revision },
                        $push: { history: entry },
                    },
                    { new: true },
                );
            }
            if (saved)
                return {
                    kind: "saved",
                    answer: answerView(
                        saved,
                        new Map([[ctx.user.userId, meetingViewer(ctx)]]),
                    ),
                    replayed: false,
                    appliedRevision: revision,
                };
            const latest = await MeetingQuestionAnswerModel.findOne(key);
            return (
                priorResult(input, latest, ctx) || {
                    kind: "conflict",
                    current: latest
                        ? answerView(
                              latest,
                              new Map([[ctx.user.userId, meetingViewer(ctx)]]),
                          )
                        : null,
                    message:
                        "Your answer changed before saving. Reload the saved answer and try again.",
                }
            );
        },
    );
}
