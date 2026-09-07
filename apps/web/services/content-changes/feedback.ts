import { randomUUID } from "crypto";
import { initialFeedbackNotification } from "@courselit/common-logic";
import type {
    ContextualFeedback,
    FeedbackInput,
    FeedbackDetail,
} from "@courselit/common-models";
import type { InternalFeedback } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import { getLessonDetails, getLessonOrThrow } from "@/graphql/lessons/logic";
import { getMedia, sealMedia } from "@/services/medialit";
import { FeedbackModel } from "./models";
import { requireCondition } from "./errors";
import { isFeedbackAdmin, requireFeedbackAdmin } from "./http";
import { feedbackInputSchema } from "./validation";
import { cursorFilter } from "./pagination";
import { formatFeedbackPrompt } from "@/lib/feedback-prompt";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";

export function feedbackView(
    record: InternalFeedback,
    admin = false,
): ContextualFeedback {
    return {
        id: record.id,
        text: record.text,
        target: record.target,
        actor: record.actor,
        photoMediaIds: record.photoMediaIds,
        state: record.state,
        ...(admin && record.notification
            ? { notification: record.notification }
            : {}),
        ...(admin && record.automaticReview
            ? {
                  review: {
                      generation: record.automaticReview.generation,
                      kind: record.automaticReview.kind,
                      grantId: record.automaticReview.grantId,
                      lastFailure: record.automaticReview.lastFailure,
                      ...("intent" in record.automaticReview
                          ? {
                                outcome:
                                    record.automaticReview.intent.result.kind,
                                summary:
                                    record.automaticReview.intent.result
                                        .summary,
                                proposalId:
                                    record.automaticReview.intent.proposal?.id,
                            }
                          : {}),
                  },
              }
            : {}),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    };
}

export async function createFeedback(
    raw: FeedbackInput,
    ctx: GQLContext,
): Promise<ContextualFeedback> {
    if (!ctx.user) return createFeedbackRecord(raw, ctx);
    requireCondition(
        String(ctx.user.domain) === String(ctx.subdomain._id),
        "forbidden",
        "Account does not belong to this site.",
        403,
    );
    return withAccountWrite(
        {
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            purpose: "feedback",
        },
        () => createFeedbackRecord(raw, ctx),
    );
}

async function createFeedbackRecord(
    raw: FeedbackInput,
    ctx: GQLContext,
): Promise<ContextualFeedback> {
    const input = feedbackInputSchema.parse(raw);
    requireCondition(
        !ctx.user || String(ctx.user.domain) === String(ctx.subdomain._id),
        "forbidden",
        "Account does not belong to this site.",
        403,
    );
    const admin = isFeedbackAdmin(ctx);
    requireCondition(
        !input.photoMediaIds?.length || admin,
        "forbidden",
        "Photos can only be attached by an administrator.",
        403,
    );
    if (input.target.kind === "lesson") {
        try {
            if (admin) await getLessonOrThrow(input.target.lessonId, ctx);
            else await getLessonDetails(input.target.lessonId, ctx);
        } catch {
            requireCondition(
                false,
                "not_found",
                "The selected lesson is not available.",
                404,
            );
        }
    }
    for (const mediaId of input.photoMediaIds || []) {
        const media = await getMedia(mediaId).catch(() => null);
        requireCondition(
            media &&
                (media as unknown as { group?: string }).group ===
                    ctx.subdomain.name &&
                media.mimeType?.startsWith("image/"),
            "not_found",
            "Photo not found in this site's media library.",
            404,
        );
        // An attachment becomes a retained library asset before its comment
        // is acknowledged. A failed media request leaves the composer draft.
        await sealMedia(mediaId, ctx.subdomain._id);
    }
    const record = await FeedbackModel.create({
        domain: ctx.subdomain._id,
        id: randomUUID(),
        ...input,
        actor: ctx.user
            ? { kind: admin ? "admin" : "member", userId: ctx.user.userId }
            : { kind: "visitor" },
        state: "open",
        notification: initialFeedbackNotification(
            ctx.subdomain.settings?.feedbackMailbox,
        ),
    });
    return feedbackView(record, admin);
}

export async function listFeedback(ctx: GQLContext, before?: string) {
    requireCondition(
        ctx.user,
        "forbidden",
        "Sign in to view your feedback.",
        403,
    );
    const records = await FeedbackModel.find({
        domain: ctx.subdomain._id,
        ...(isFeedbackAdmin(ctx) ? {} : { "actor.userId": ctx.user.userId }),
        ...cursorFilter(before),
    })
        .sort({ createdAt: -1, id: 1 })
        .limit(50);
    return records.map((record) => feedbackView(record, isFeedbackAdmin(ctx)));
}

export async function feedbackDetail(
    id: string,
    ctx: GQLContext,
): Promise<FeedbackDetail> {
    requireCondition(ctx.user, "forbidden", "Sign in to view feedback.", 403);
    const record = await FeedbackModel.findOne({
        domain: ctx.subdomain._id,
        id,
        ...(isFeedbackAdmin(ctx) ? {} : { "actor.userId": ctx.user.userId }),
    });
    requireCondition(record, "not_found", "Feedback not found.", 404);
    const feedback = feedbackView(record, isFeedbackAdmin(ctx));
    return {
        feedback,
        ...(isFeedbackAdmin(ctx)
            ? {
                  prompt: formatFeedbackPrompt(feedback),
              }
            : {}),
    };
}

export async function setFeedbackState(
    id: string,
    action: "close" | "reopen",
    ctx: GQLContext,
) {
    requireFeedbackAdmin(ctx);
    const update =
        action === "close"
            ? {
                  $set: {
                      state: "closed",
                      expiresAt: new Date(Date.now() + 90 * 86400_000),
                  },
              }
            : { $set: { state: "open" }, $unset: { expiresAt: 1 } };
    const record = await FeedbackModel.findOneAndUpdate(
        { domain: ctx.subdomain._id, id },
        update,
        { new: true },
    );
    requireCondition(record, "not_found", "Feedback not found.", 404);
    return feedbackView(record, true);
}

export async function deleteFeedback(id: string, ctx: GQLContext) {
    requireCondition(ctx.user, "forbidden", "Sign in to remove feedback.", 403);
    const result = await FeedbackModel.deleteOne({
        domain: ctx.subdomain._id,
        id,
        ...(isFeedbackAdmin(ctx) ? {} : { "actor.userId": ctx.user.userId }),
    });
    requireCondition(
        result.deletedCount === 1,
        "not_found",
        "Feedback not found.",
        404,
    );
    // Photo references do not own media assets. Removal does not delete library files.
    return { deleted: true };
}
