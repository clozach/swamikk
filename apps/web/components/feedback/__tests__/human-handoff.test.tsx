import type { ContextualFeedback } from "@courselit/common-models";
import { allFeedbackPages } from "../api";
import { getPagePrompt } from "../page-prompt";

jest.mock("../api", () => ({ allFeedbackPages: jest.fn() }));

const base: ContextualFeedback = {
    id: "page-comment",
    text: "Human-entered feedback",
    target: { kind: "page", path: "/p/welcome", componentId: "page" },
    actor: { kind: "member", userId: "private-member" },
    photoMediaIds: [],
    state: "open",
    createdAt: "2026-09-07T10:00:00Z",
    updatedAt: "2026-09-07T10:00:00Z",
};

afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
});

test("page Copy prompt exports only matching open comments, without scraping private page content", async () => {
    document.body.innerHTML =
        '<div data-feedback-lesson="visible-lesson">Private account text stays here</div>';
    jest.mocked(allFeedbackPages).mockResolvedValue([
        base,
        {
            ...base,
            id: "separator-comment",
            text: "A body with\n---\nits own separator line",
        },
        { ...base, id: "closed-comment", state: "closed" },
        {
            ...base,
            id: "other-page",
            target: { kind: "page", path: "/profile", componentId: "page" },
        },
        {
            ...base,
            id: "visible-lesson-comment",
            target: {
                kind: "lesson",
                lessonId: "visible-lesson",
                field: "title",
            },
        },
        {
            ...base,
            id: "other-lesson",
            target: {
                kind: "lesson",
                lessonId: "private-lesson",
                field: "title",
            },
        },
    ]);
    const prompt = await getPagePrompt("/p/welcome");
    expect(prompt).toContain(`Site: ${window.location.origin}/p/welcome`);
    expect(prompt).toContain("Feedback ID: page-comment");
    expect(prompt).toContain("Feedback ID: visible-lesson-comment");
    expect(prompt).toContain(
        "Feedback:\n<feedback>\nHuman-entered feedback\n</feedback>",
    );
    expect(prompt).toContain(
        "<feedback>\nA body with\n---\nits own separator line\n</feedback>",
    );
    expect(prompt.split("\n\n---\n\n")).toHaveLength(3);
    expect(prompt).not.toMatch(
        /closed-comment|other-page|other-lesson|Private account text|private-member/,
    );
    expect(allFeedbackPages).toHaveBeenCalledTimes(1);
    expect(allFeedbackPages).toHaveBeenCalledWith("/api/feedback", "feedback");
});

test("a page with no saved open feedback produces no export", async () => {
    jest.mocked(allFeedbackPages).mockResolvedValue([
        { ...base, state: "closed" },
    ]);
    await expect(getPagePrompt("/p/welcome")).rejects.toThrow(
        "There are no saved comments for this page yet.",
    );
});
