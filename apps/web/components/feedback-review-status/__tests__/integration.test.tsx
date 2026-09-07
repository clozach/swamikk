import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContextualFeedback } from "@courselit/common-models";
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
beforeEach(() => {
    jest.clearAllMocks();
    search.delete("id");
    comments = [comment];
    jest.mocked(allFeedbackPages).mockImplementation(
        async (_path, key) => (key === "feedback" ? comments : []) as any,
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

test("existing Refresh updates real record status and Development prompt still copies the server prompt", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
    show();
    await screen.findByText("Review started");
    jest.mocked(feedbackRequest).mockResolvedValueOnce({
        feedback: comment,
        prompt: "Exact saved feedback prompt",
    });
    fireEvent.click(screen.getByRole("button", { name: "Development prompt" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const link = await screen.findByRole("link", {
        name: "Open proposal review-comment-a-1",
    });
    expect(link).toHaveAttribute(
        "href",
        "/dashboard/changes?id=review-comment-a-1",
    );
    expect(
        screen.getByRole("button", { name: "Development prompt" }),
    ).toBeInTheDocument();
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
