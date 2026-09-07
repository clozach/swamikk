import type {
    ContentChangeInput,
    ContentChangeVersion,
    LessonContentChangeInput,
    PageWidgetChangeInput,
} from "@courselit/common-models";
import type {
    InternalContentChange,
    InternalPageContentChange,
    InternalLessonContentChange,
} from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import { requirePageEditor, preparePageVersion } from "./page-adapter";
import { editableLesson, prepareVersion } from "./lesson-adapter";

export const isPageRecord = (
    record: InternalContentChange,
): record is InternalPageContentChange => record.target.kind === "page-widget";
export const isLessonRecord = (
    record: InternalContentChange,
): record is InternalLessonContentChange => record.target.kind === "lesson";
export async function editableChangeTarget(
    record: Pick<InternalContentChange, "target">,
    ctx: GQLContext,
) {
    return record.target.kind === "page-widget"
        ? requirePageEditor(ctx)
        : editableLesson(record.target.lessonId, ctx);
}
export async function prepareTargetVersion(
    input: ContentChangeInput,
    version: number,
    ctx: GQLContext,
): Promise<ContentChangeVersion> {
    return input.target.kind === "page-widget"
        ? preparePageVersion(input as PageWidgetChangeInput, version, ctx)
        : prepareVersion(input as LessonContentChangeInput, version, ctx);
}
