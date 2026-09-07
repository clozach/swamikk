import type { ContextualFeedback } from "@courselit/common-models";
import { allFeedbackPages } from "./api";
import { formatFeedbackPrompt } from "@/lib/feedback-prompt";
import { feedbackUi as copy } from "@config/strings";

export async function getPagePrompt(path: string): Promise<string> {
    const feedback = await allFeedbackPages<ContextualFeedback>(
        "/api/feedback",
        "feedback",
    );
    const lessons = new Set(
        Array.from(
            document.querySelectorAll<HTMLElement>("[data-feedback-lesson]"),
        ).map((element) => element.dataset.feedbackLesson),
    );
    const comments = feedback.filter(
        (comment) =>
            comment.state === "open" &&
            (comment.target.kind === "page"
                ? comment.target.path === path
                : lessons.has(comment.target.lessonId)),
    );
    if (!comments.length) throw new Error(copy.noComments);
    return `Site: ${window.location.origin}${path}\n\n${comments.map(formatFeedbackPrompt).join("\n\n---\n\n")}`;
}
