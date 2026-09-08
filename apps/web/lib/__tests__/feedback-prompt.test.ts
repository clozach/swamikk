import type { ContextualFeedback } from "@courselit/common-models";
import { formatFeedbackPrompt } from "../feedback-prompt";

test("human export leads with the build instruction and ends with the raw feedback, without private account or reviewer metadata", () => {
    const feedback: ContextualFeedback = {
        id: "synthetic-feedback",
        text: 'Please explain this.\n"Quoted" text and a --- line stay verbatim.',
        target: {
            kind: "page",
            path: "/p/welcome",
            componentId: "#intro > div:nth-of-type(2)",
            label: "Introduction",
        },
        actor: { kind: "admin", userId: "private-actor-id" },
        photoMediaIds: ["private-photo-reference"],
        state: "open",
        createdAt: "2026-09-07T10:00:00Z",
        updatedAt: "2026-09-07T10:00:00Z",
        review: {
            kind: "leased",
            generation: 1,
            grantId: "private-grant-id",
        },
    };
    const prompt = formatFeedbackPrompt(feedback);
    expect(prompt.startsWith("Build this CourseLit change")).toBe(true);
    expect(prompt.endsWith(`Feedback:\n${feedback.text}`)).toBe(true);
    expect(prompt).not.toContain(JSON.stringify(feedback.text));
    expect(prompt).toContain(JSON.stringify(feedback.target));
    expect(prompt).toContain('["private-photo-reference"]');
    expect(prompt).toContain("IDs only; no image files or signed URLs");
    expect(prompt).toContain("do not authorize fetching private media");
    expect(prompt).toContain("separate authenticated approval");
    expect(prompt).not.toMatch(/human review|Untrusted|Do not apply/);
    expect(prompt).not.toMatch(
        /private-actor-id|private-grant-id|2026-09-07T10:00:00Z/,
    );
});
