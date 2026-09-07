import { render, screen } from "@testing-library/react";
import type {
    ContextualFeedback,
    FeedbackReviewStatus as Status,
    MemberMimicView,
} from "@courselit/common-models";
import { ProfileContext } from "@/components/contexts";
import { MemberMimicContext } from "@/components/member-mimic/context";
import FeedbackReviewStatus from "..";

const feedback: ContextualFeedback = {
    id: "feedback-a",
    text: "Comment",
    target: { kind: "page", path: "/p/welcome", componentId: "#copy" },
    actor: { kind: "member", userId: "private-member-id" },
    photoMediaIds: [],
    state: "open",
    createdAt: "2026-09-07T10:00:00Z",
    updatedAt: "2026-09-07T10:00:00Z",
};
const base: Status = {
    generation: 7,
    grantId: "private-grant-id",
    kind: "leased",
};
function show(
    comment = feedback,
    permissions: string[] | null = ["site:manage"],
    mimic: MemberMimicView = { kind: "inactive" },
) {
    return render(
        <ProfileContext.Provider
            value={{
                profile: permissions ? { permissions } : null,
                setProfile: jest.fn(),
            }}
        >
            <MemberMimicContext.Provider value={mimic}>
                <FeedbackReviewStatus feedback={comment} />
            </MemberMimicContext.Provider>
        </ProfileContext.Provider>,
    );
}

test.each([null, [], ["course:manage"]])(
    "public and member profiles render no operational status even if payload contains it (%s)",
    (permissions) => {
        const { container } = show(
            {
                ...feedback,
                review: { ...base, summary: "Private review summary" },
            },
            permissions,
        );
        expect(container).toBeEmptyDOMElement();
    },
);
test("Mimic never displays reviewer metadata or notes", () => {
    const { container } = show({ ...feedback, review: base }, ["site:manage"], {
        kind: "active",
    } as MemberMimicView);
    expect(container).toBeEmptyDOMElement();
});
test("awaiting status states only recorded absence, with no scheduled review promise", () => {
    show();
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
    expect(
        screen.getByText(/No automatic review has been recorded/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
test.each([
    { ...feedback, actor: { kind: "admin" as const, userId: "admin" } },
    { ...feedback, photoMediaIds: ["private-photo-reference"] },
])(
    "excluded administrator/photo feedback is not presented as queued",
    (comment) => {
        const { container } = show(comment);
        expect(screen.getByText("Human review only")).toBeInTheDocument();
        expect(screen.queryByText("Awaiting review")).not.toBeInTheDocument();
        expect(container.textContent).not.toContain("private-photo-reference");
    },
);
test("closed feedback without review is not presented as pending", () => {
    show({ ...feedback, state: "closed" });
    expect(
        screen.getByText("No automatic review recorded"),
    ).toBeInTheDocument();
});
test("leased state does not claim a worker is still active and omits technical metadata", () => {
    const { container } = show({ ...feedback, review: base });
    expect(screen.getByText("Review started")).toBeInTheDocument();
    expect(
        screen.getByText(/No result has been recorded yet/),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
        /private-grant-id|private-member-id|generation/i,
    );
});
test("accepted intent has no draft link until insertion is confirmed", () => {
    show({
        ...feedback,
        review: {
            ...base,
            kind: "submitting",
            outcome: "text-proposal",
            proposalId: "review-feedback-a-7",
        },
    });
    expect(
        screen.getByText("Result awaiting confirmation"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
test("retained draft links to its exact native proposal and does not invent its current approval state", () => {
    show({
        ...feedback,
        state: "closed",
        review: {
            ...base,
            kind: "done",
            outcome: "text-proposal",
            proposalId: "review-feedback-a-7",
            summary: "Clarify the practice",
        },
    });
    expect(screen.getByText("Draft retained")).toBeInTheDocument();
    expect(
        screen.getByRole("link", { name: "Open proposal review-feedback-a-7" }),
    ).toHaveAttribute("href", "/dashboard/changes?id=review-feedback-a-7");
    expect(screen.getByText(/current approval status/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
test("escalation renders only its actual summary as text", () => {
    const summary =
        '<img src=x onerror="alert(1)"> Please review the access question.';
    const { container } = show({
        ...feedback,
        review: { ...base, kind: "done", outcome: "escalation", summary },
    });
    expect(screen.getByText("Needs human review")).toBeInTheDocument();
    expect(screen.getByText(summary)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
test.each(["leased", "submitting"] as const)(
    "failed %s state offers safe guidance without raw errors or a fake retry action",
    (kind) => {
        const { container } = show({
            ...feedback,
            review: {
                ...base,
                kind,
                lastFailure: {
                    code: "sensitive_database_error",
                    at: "2026-09-07T10:00:00Z",
                },
            },
        });
        expect(screen.getByText("Review needs attention")).toBeInTheDocument();
        expect(screen.getByText(/Choose Refresh before/)).toBeInTheDocument();
        expect(container.textContent).not.toContain("sensitive_database_error");
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    },
);
test("completed result supersedes earlier failure without suggesting another retry", () => {
    show({
        ...feedback,
        review: {
            ...base,
            kind: "done",
            outcome: "escalation",
            summary: "Human decision needed",
            lastFailure: { code: "unavailable", at: "2026-09-07T10:00:00Z" },
        },
    });
    expect(screen.getByText("Needs human review")).toBeInTheDocument();
    expect(
        screen.queryByText("Review needs attention"),
    ).not.toBeInTheDocument();
});
test("missing completion fields do not fabricate a draft or completion", () => {
    show({ ...feedback, review: { ...base, kind: "done" } });
    expect(screen.getByText("Review status unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
