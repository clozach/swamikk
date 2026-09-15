import { requireFeedbackAdmin } from "../content-changes/http";
import { createHash } from "crypto";
import type { MeetingQuestionSetWrite } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { requireCondition } from "../content-changes/errors";
import { MeetingQuestionSetModel } from "./models";
import { setView } from "./views";

export async function upsertQuestionSet(
    input: MeetingQuestionSetWrite,
    ctx: GQLContext,
) {
    requireFeedbackAdmin(ctx);
    return withAccountWrite(
        {
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            purpose: "meeting-question-set",
        },
        async () => {
            await MeetingQuestionSetModel.init();
            const set = {
                ...input.set,
                questions: [...input.set.questions].sort(
                    (a, b) => a.number - b.number,
                ),
            };
            const contentHash = createHash("sha256")
                .update(JSON.stringify(set))
                .digest("hex");
            const key = { domain: ctx.subdomain._id, id: set.id };
            const current = await MeetingQuestionSetModel.findOne(key);
            if (current?.contentHash === contentHash) return setView(current);
            requireCondition(
                (current?.revision || 0) === input.expectedRevision,
                "stale",
                "The question set changed. Reload it before saving.",
                409,
            );
            requireCondition(
                !current ||
                    current.questions.every((question) =>
                        set.questions.some((next) => next.id === question.id),
                    ),
                "retained_questions",
                "Keep existing question IDs when updating this set; their answers and context are retained.",
                409,
            );
            if (!current) {
                try {
                    return setView(
                        await MeetingQuestionSetModel.create({
                            ...key,
                            ...set,
                            contentHash,
                            revision: 1,
                        }),
                    );
                } catch (error) {
                    if (
                        !(error instanceof Error) ||
                        !("code" in error) ||
                        error.code !== 11000
                    )
                        throw error;
                }
            } else {
                const saved = await MeetingQuestionSetModel.findOneAndUpdate(
                    { ...key, revision: input.expectedRevision },
                    { $set: { ...set, contentHash }, $inc: { revision: 1 } },
                    { new: true },
                );
                if (saved) return setView(saved);
            }
            const latest = await MeetingQuestionSetModel.findOne(key);
            requireCondition(
                latest?.contentHash === contentHash,
                "stale",
                "The question set changed. Reload it before saving.",
                409,
            );
            return setView(latest);
        },
    );
}
