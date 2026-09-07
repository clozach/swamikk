import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
    ContextualFeedback,
    ContentChange,
} from "@courselit/common-models";
import { ProfileContext } from "@/components/contexts";
import ReviewHub from "@/components/feedback/review-hub";
import { allFeedbackPages, feedbackRequest } from "@/components/feedback/api";

const search = new URLSearchParams();
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn() }),
    useSearchParams: () => search,
}));
jest.mock("@/components/feedback/api", () => ({
    allFeedbackPages: jest.fn(),
    feedbackRequest: jest.fn(),
}));
jest.mock("@/components/feedback/mailbox-settings", () => () => null);
jest.mock("@/components/feedback/mailbox-status", () => () => null);
jest.mock("@/components/feedback/proposal-review", () => ({
    __esModule: true,
    default: ({ change }) => <p>Native proposal {change.id}</p>,
    changeStateLabel: () => "Proposed",
}));

const comment: ContextualFeedback = {
    id: "comment-a",
    text: "Please clarify the duration.",
    target: { kind: "page", path: "/p/welcome", componentId: "#copy" },
    actor: { kind: "member", userId: "member-a" },
    photoMediaIds: [],
    state: "open",
    createdAt: "2026-09-07T10:00:00Z",
    updatedAt: "2026-09-07T10:00:00Z",
    review: { generation: 1, grantId: "grant-private", kind: "leased" },
};
let comments: ContextualFeedback[];
let changes: ContentChange[];
beforeEach(() => {
    jest.clearAllMocks();
    search.delete("id");
    comments = [comment];
    changes = [];
    jest.mocked(allFeedbackPages).mockImplementation(
        async (_path, key) => (key === "feedback" ? comments : changes) as any,
    );
});
function show(permissions = ["site:manage"]) {
    return render(
        <ProfileContext.Provider
            value={{
                profile: { userId: "admin", permissions },
                setProfile: jest.fn(),
            }}
        >
            <ReviewHub />
        </ProfileContext.Provider>,
    );
}

test("human Copy prompt and Refresh preserve ordinary proposals without advertising the optional reviewer", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
    show();
    await screen.findByText(comment.text);
    expect(
        screen.queryByRole("region", { name: "Automatic review status" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Review started")).not.toBeInTheDocument();
    expect(
        screen.getByText(/ChatGPT \(Codex\).*Claude.app/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Photo IDs are included/)).toBeInTheDocument();
    jest.mocked(feedbackRequest).mockResolvedValueOnce({
        feedback: comment,
        prompt: "Exact saved feedback prompt",
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith("Exact saved feedback prompt"),
    );
    expect(feedbackRequest).toHaveBeenCalledWith("/api/feedback/comment-a");
    comments = [
        {
            ...comment,
            review: {
                ...comment.review!,
                kind: "done",
                outcome: "text-proposal",
                proposalId: "review-comment-a-1",
            },
        },
    ];
    changes = [
        {
            id: "review-comment-a-1",
            summary: "Clarify the duration",
            version: 1,
        } as ContentChange,
    ];
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const link = await screen.findByRole("link", {
        name: /Clarify the duration/,
    });
    expect(link).toHaveAttribute(
        "href",
        "/dashboard/changes?id=review-comment-a-1",
    );
    expect(
        screen.getByRole("button", { name: "Copy prompt" }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole("region", { name: "Automatic review status" }),
    ).not.toBeInTheDocument();
});
test("clipboard refusal keeps the same prompt available for manual selection without a write request", async () => {
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
        configurable: true,
    });
    jest.mocked(feedbackRequest).mockResolvedValueOnce({
        feedback: comment,
        prompt: "Retained human-review text",
    });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Copy prompt" }));
    expect(
        await screen.findByRole("textbox", { name: "Copy prompt" }),
    ).toHaveValue("Retained human-review text");
    expect(feedbackRequest).toHaveBeenCalledTimes(1);
    expect(feedbackRequest).toHaveBeenCalledWith("/api/feedback/comment-a");
});
test("the retained ID uses the existing proposal detail query and read", async () => {
    search.set("id", "review-comment-a-1");
    jest.mocked(feedbackRequest).mockResolvedValue({
        change: { id: "review-comment-a-1" },
    });
    show();
    await screen.findByText("Native proposal review-comment-a-1");
    expect(feedbackRequest).toHaveBeenCalledWith(
        "/api/content-changes/review-comment-a-1",
    );
});
test("member view neither fetches nor renders administrative review status", () => {
    show([]);
    expect(allFeedbackPages).not.toHaveBeenCalled();
    expect(feedbackRequest).not.toHaveBeenCalled();
    expect(
        screen.queryByRole("region", { name: "Automatic review status" }),
    ).not.toBeInTheDocument();
});
