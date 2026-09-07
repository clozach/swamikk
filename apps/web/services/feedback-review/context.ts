import type {
    FeedbackReviewContext,
    FeedbackReviewScope,
} from "@courselit/common-models";
import type { InternalFeedback } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import DomainModel from "@/models/Domain";
import LessonModel from "@/models/Lesson";
import PageModel from "@/models/Page";
import { getLessonAccess } from "@/services/member-access";
import { pageWidgetFields } from "../content-changes/page-fields";
import { pageFingerprint } from "../content-changes/page-guard";
import { lessonFingerprint } from "../content-changes/lesson-guard";
import { pageRenderFingerprint } from "../content-changes/page-adapter";
import { fingerprint } from "../content-changes/stable";
import { validateTextEdit } from "../content-changes/text-safety";
import { ContentChangeError } from "../content-changes/errors";
import { safeJson } from "./validation";
const unavailable = (): FeedbackReviewContext => ({
    kind: "escalation-only",
    reason: "private-or-unavailable",
});
const unsupported = (): FeedbackReviewContext => ({
    kind: "escalation-only",
    reason: "unsupported-target",
});
export async function resolvePublicContext(
    record: InternalFeedback,
    scopes: FeedbackReviewScope[],
): Promise<FeedbackReviewContext> {
    const target = record.target;
    try {
        if (target.kind === "lesson") {
            if (!scopes.includes("public-lesson-text"))
                return { kind: "escalation-only", reason: "scope-excluded" };
            const lesson = await LessonModel.findOne({
                domain: record.domain,
                lessonId: target.lessonId,
                published: true,
                type: "text",
            });
            if (!lesson) return unavailable();
            const access = await getLessonAccess({
                domainId: String(record.domain),
                lessonId: lesson.lessonId,
                courseId: lesson.courseId,
            });
            if (access.kind !== "allowed" || access.source !== "public")
                return unavailable();
            const value =
                target.field === "title" ? lesson.title : lesson.content;
            if (target.field === "content")
                validateTextEdit({ type: "doc", content: [] }, value as any);
            safeJson(value);
            if (Buffer.byteLength(JSON.stringify(value), "utf8") > 24000)
                return unsupported();
            return {
                kind: "text",
                target: { kind: "lesson", lessonId: lesson.lessonId },
                field: target.field,
                valueKind: target.field === "title" ? "text" : "rich-text",
                value: JSON.parse(JSON.stringify(value)),
                sourceHash: lessonFingerprint(lesson),
            };
        }
        if (!scopes.includes("public-page-text"))
            return { kind: "escalation-only", reason: "scope-excluded" };
        // Only native site routes and one literal native ID. Never evaluate a selector,
        // follow a URL, read a member route, or infer a target from the comment's label.
        const match = /^\/p\/([a-zA-Z0-9_-]{1,128})$/.exec(target.path);
        const pageId = target.path === "/" ? "homepage" : match?.[1];
        if (!pageId) return unavailable();
        const page = await PageModel.findOne({
            domain: record.domain,
            pageId,
            type: "site",
            draftOnly: { $ne: true },
            deleted: { $ne: true },
        });
        if (!page) return unavailable();
        const widgetId = /^#([a-zA-Z0-9_-]{1,128})$/.exec(
            target.componentId,
        )?.[1];
        if (!widgetId && target.componentId !== "page")
            return { kind: "escalation-only", reason: "ambiguous-target" };
        const fields = page.layout
            .filter(
                (widget) =>
                    !widget.shared &&
                    (!widgetId || widget.widgetId === widgetId),
            )
            .flatMap((widget) =>
                pageWidgetFields(widget)
                    .filter((field) => field.kind !== "image")
                    .map((field) => ({ widget, field })),
            );
        if (fields.length !== 1)
            return { kind: "escalation-only", reason: "ambiguous-target" };
        const { widget, field } = fields[0];
        safeJson(field.value);
        if (field.kind === "rich-text")
            validateTextEdit({ type: "doc", content: [] }, field.value as any);
        if (Buffer.byteLength(JSON.stringify(field.value), "utf8") > 24000)
            return unsupported();
        const domain = await DomainModel.findById(record.domain);
        if (!domain) return unavailable();
        // Published rendering only; no administrator user is fabricated for this read.
        const rendering = await pageRenderFingerprint(page, widget.widgetId!, {
            subdomain: domain,
            user: undefined,
            address: "",
        } as unknown as GQLContext);
        return {
            kind: "text",
            target: {
                kind: "page-widget",
                pageId: page.pageId,
                widgetId: widget.widgetId!,
                field: field.field,
            },
            field: field.field,
            valueKind: field.kind as "text" | "rich-text",
            value: field.value as any,
            sourceHash: fingerprint({
                page: pageFingerprint(page),
                rendering: rendering.hash,
            }),
        };
    } catch (error) {
        if (error instanceof ContentChangeError) return unsupported();
        throw error;
    }
}
export function reviewInputHash(
    record: InternalFeedback,
    context: FeedbackReviewContext,
) {
    return fingerprint({ text: record.text, target: record.target, context });
}
