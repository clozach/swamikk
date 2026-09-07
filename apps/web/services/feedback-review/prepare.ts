import type {
    FeedbackReviewContext,
    FeedbackReviewResult,
    FeedbackReviewIntent,
} from "@courselit/common-models";
import type { InternalFeedback } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import LessonModel from "@/models/Lesson";
import DomainModel from "@/models/Domain";
import {
    preparePageSnapshotVersion,
    pageRenderFingerprint,
} from "../content-changes/page-adapter";
import { prepareLessonSnapshotVersion } from "../content-changes/lesson-adapter";
import { contentChangeInputSchema } from "../content-changes/validation";
import { requireCondition } from "../content-changes/errors";
import { pageFingerprint } from "../content-changes/page-guard";
import { lessonFingerprint } from "../content-changes/lesson-guard";
import { fingerprint } from "../content-changes/stable";
import type { ReviewerAuthority } from "./authority";
import { resolvePublicContext, reviewInputHash } from "./context";
export async function prepareReviewIntent(
    record: InternalFeedback,
    context: FeedbackReviewContext,
    result: FeedbackReviewResult,
    authority: ReviewerAuthority,
): Promise<FeedbackReviewIntent> {
    const lease = record.automaticReview!;
    const resultHash = fingerprint(result);
    const id = `review-${record.id}-${lease.generation}`;
    const intent: FeedbackReviewIntent = {
        id,
        resultHash,
        result,
        acceptedAt: new Date().toISOString(),
    };
    if (result.kind === "escalation") return intent;
    requireCondition(
        context.kind === "text",
        "escalation_required",
        "This feedback requires human review; no text target is available.",
        409,
    );
    requireCondition(
        result.replacement.kind === context.valueKind,
        "bad_request",
        "The replacement must match the approved context field.",
    );
    const principal = `feedback-review:${authority.grant.id}`;
    const patch =
        context.target.kind === "page-widget"
            ? result.replacement
            : context.field === "title" && result.replacement.kind === "text"
              ? { title: result.replacement.text }
              : result.replacement.kind === "rich-text"
                ? { content: result.replacement.content }
                : {};
    const input = contentChangeInputSchema.parse({
        target: context.target,
        patch,
        feedbackId: record.id,
        summary: result.summary,
    });
    let prepared;
    if (input.target.kind === "page-widget") {
        const page = await PageModel.findOne({
            domain: record.domain,
            pageId: input.target.pageId,
            draftOnly: { $ne: true },
            deleted: { $ne: true },
            type: "site",
        });
        const domain = await DomainModel.findById(record.domain);
        requireCondition(
            page && domain,
            "stale",
            "The public target changed. A fresh review is required.",
            409,
        );
        const rendering = await pageRenderFingerprint(
            page,
            input.target.widgetId,
            {
                subdomain: domain,
                user: undefined,
                address: "",
            } as unknown as GQLContext,
        );
        requireCondition(
            fingerprint({
                page: pageFingerprint(page),
                rendering: rendering.hash,
            }) === context.sourceHash,
            "stale",
            "The reviewed public page changed.",
            409,
        );
        prepared = await preparePageSnapshotVersion(
            input as any,
            1,
            page,
            principal,
            async () => rendering,
        );
    } else {
        requireCondition(
            input.target.kind === "lesson",
            "unsupported_target",
            "Only a text edit can be proposed.",
        );
        const lesson = await LessonModel.findOne({
            domain: record.domain,
            lessonId: input.target.lessonId,
            published: true,
        });
        requireCondition(lesson, "stale", "The public lesson changed.", 409);
        requireCondition(
            lessonFingerprint(lesson) === context.sourceHash,
            "stale",
            "The reviewed public lesson changed.",
            409,
        );
        prepared = await prepareLessonSnapshotVersion(
            input as any,
            1,
            lesson,
            principal,
        );
    }
    // Re-read public eligibility and the selected value after preparing the native
    // snapshot; a privacy/content transition during preparation cannot accept a result.
    const current = await resolvePublicContext(record, authority.grant.scopes);
    requireCondition(
        reviewInputHash(record, current) === lease.inputHash,
        "stale",
        "The feedback or public target changed. Claim a fresh review.",
        409,
    );
    intent.proposal = {
        id,
        target: context.target,
        version: prepared,
        provenance: {
            kind: "feedback-review",
            grantId: authority.grant.id,
            feedbackId: record.id,
            generation: lease.generation,
            inputHash: lease.inputHash,
            resultHash,
        },
    };
    return intent;
}
