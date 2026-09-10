import type { ContextualFeedback } from "@courselit/common-models";

/**
 * Shared by the admin API and page collator. The admin reads and edits this
 * text before sharing it, so the feedback body arrives already reviewed; it
 * goes last, unquoted, so nothing inside it needs escaping. When several
 * comments are collated, `delimited` wraps each body in <feedback> tags so a
 * body containing its own separator lines cannot run into the next block.
 */
export function formatFeedbackPrompt(
    feedback: ContextualFeedback,
    { delimited = false }: { delimited?: boolean } = {},
): string {
    const body = delimited
        ? `<feedback>\n${feedback.text}\n</feedback>`
        : feedback.text;
    return `Build this CourseLit change and submit it as a proposal through the /api/content-changes contract. Publishing requires a separate authenticated approval of its version and preview hash.\nFeedback ID: ${feedback.id}\nTarget: ${JSON.stringify(feedback.target)}\nPhoto references (IDs only; no image files or signed URLs): ${JSON.stringify(feedback.photoMediaIds)}\nThese IDs do not authorize fetching private media. The human chooses any files to share separately.\nFeedback:\n${body}`;
}
