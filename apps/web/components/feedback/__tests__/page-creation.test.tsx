import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PageCreationForm from "../page-creation-form";
import ProposalReview from "../proposal-review";
import { ProfileContext } from "@/components/contexts";
import { feedbackRequest } from "../api";
import { useMemberMimic } from "@/components/member-mimic/context";
import type { ContentChange } from "@courselit/common-models";
const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
jest.mock("@/components/member-mimic/context", () => ({
    useMemberMimic: jest.fn(),
}));
jest.mock("@/lib/theme-styles", () => ({
    generateThemeStyles: () => ".courselit-theme {}",
}));
jest.mock("@/components/public/base-layout/template/widget-by-name", () => ({
    __esModule: true,
    default: ({ settings }) => (
        <div>
            {settings.text.content.map((paragraph, index) => (
                <p key={index}>
                    {paragraph.content?.map((text) => text.text).join("")}
                </p>
            ))}
        </div>
    ),
}));
jest.mock("@courselit/page-blocks", () => ({ TextRenderer: () => null }));
const profile = { userId: "admin", permissions: ["site:manage"] };
const form = (user = profile) => (
    <ProfileContext.Provider value={{ profile: user } as any}>
        <PageCreationForm />
    </ProfileContext.Provider>
);
const change = {
    id: "proposal",
    target: { kind: "page-create", pageId: "welcome" },
    version: 1,
    summary: "New page",
    patch: {
        kind: "page-create",
        title: "Welcome",
        intent: "Welcome members",
        materials: "Source words",
        content: { type: "doc", content: [] },
    },
    baseline: {
        kind: "page-create",
        documentId: "a".repeat(24),
        theme: {},
        typefaces: [],
        renderFingerprint: "b",
    },
    preview: {
        title: "Welcome",
        path: "/p/welcome",
        layout: [
            {
                widgetId: "text",
                name: "rich-text",
                settings: {
                    text: {
                        type: "doc",
                        content: [
                            {
                                type: "paragraph",
                                content: [
                                    { type: "text", text: "Exact final words" },
                                ],
                            },
                        ],
                    },
                },
            },
        ],
    },
    previewHash: "a".repeat(64),
    state: { kind: "proposed" },
    history: [],
    approvals: [],
} as unknown as ContentChange;
beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
    (useMemberMimic as jest.Mock).mockReturnValue({ kind: "inactive" });
});
test("admin prepares exact title/body/route and retains prompt without sending approval", async () => {
    (feedbackRequest as jest.Mock).mockResolvedValue({ change });
    render(form());
    fireEvent.click(screen.getByText("Propose a new text page"));
    fireEvent.change(screen.getByLabelText("Prompt / intended result"), {
        target: { value: "Welcome members" },
    });
    fireEvent.change(screen.getByLabelText(/Source material \(optional\)/), {
        target: { value: "Original words" },
    });
    fireEvent.change(screen.getByLabelText("Page title"), {
        target: { value: "Welcome" },
    });
    fireEvent.change(screen.getByLabelText(/Page address/), {
        target: { value: "welcome" },
    });
    fireEvent.change(screen.getByLabelText(/Proposed final body/), {
        target: { value: "First paragraph\n\nSecond paragraph" },
    });
    fireEvent.click(
        screen.getByRole("button", { name: "Prepare page review" }),
    );
    await waitFor(() =>
        expect(push).toHaveBeenCalledWith("/dashboard/changes/proposal"),
    );
    expect(feedbackRequest).toHaveBeenCalledTimes(1);
    expect((feedbackRequest as jest.Mock).mock.calls[0][1]).toMatchObject({
        target: { kind: "page-create", pageId: "welcome" },
        patch: {
            title: "Welcome",
            intent: "Welcome members",
            materials: "Original words",
            content: {
                content: [
                    { content: [{ text: "First paragraph" }] },
                    { content: [{ text: "Second paragraph" }] },
                ],
            },
        },
    });
    expect(sessionStorage.getItem("page-edit:admin:new-page")).toBeNull();
});
test("Mimic and members do not mount private authoring fields", () => {
    const view = render(form({ userId: "member", permissions: [] }));
    expect(
        screen.queryByText("Propose a new text page"),
    ).not.toBeInTheDocument();
    (useMemberMimic as jest.Mock).mockReturnValue({ kind: "active" });
    view.rerender(form());
    expect(
        screen.queryByText("Propose a new text page"),
    ).not.toBeInTheDocument();
});
test("interrupted prepare keeps the current text and asks for result review before retry", async () => {
    (feedbackRequest as jest.Mock).mockRejectedValue(new Error("Interrupted"));
    render(form());
    fireEvent.click(screen.getByText("Propose a new text page"));
    fireEvent.change(screen.getByLabelText("Prompt / intended result"), {
        target: { value: "Keep this intention" },
    });
    fireEvent.submit(
        screen
            .getByRole("button", { name: "Prepare page review" })
            .closest("form")!,
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Prompt / intended result")).toHaveValue(
        "Keep this intention",
    );
    expect(push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("page-edit:admin:new-page")).toContain(
        "Keep this intention",
    );
});
test("creation review discloses exact body, route and separate publication then sends explicit version/hash approval", async () => {
    const onChange = jest.fn();
    (feedbackRequest as jest.Mock).mockResolvedValue({ change });
    render(<ProposalReview change={change} onChange={onChange} />);
    expect(screen.getByText("/p/welcome")).toBeInTheDocument();
    expect(screen.getByText("Exact final words")).toBeInTheDocument();
    expect(screen.getByText(/separate Publish action/)).toBeInTheDocument();
    expect(feedbackRequest).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole("button", {
            name: "Approve creation of unpublished page",
        }),
    );
    await waitFor(() =>
        expect(feedbackRequest).toHaveBeenCalledWith(
            "/api/content-changes/proposal",
            { action: "approve", version: 1, previewHash: "a".repeat(64) },
        ),
    );
});
test("successful creation opens only the retained native result identity and offers no generic text revert", () => {
    render(
        <ProposalReview
            change={{ ...change, state: { kind: "applied" } } as ContentChange}
            onChange={jest.fn()}
        />,
    );
    expect(
        screen.getByRole("link", { name: "Open native draft editor" }),
    ).toHaveAttribute(
        "href",
        `/dashboard/page/welcome?documentId=${"a".repeat(24)}&redirectTo=/dashboard/changes/proposal`,
    );
    expect(
        screen.queryByRole("button", { name: /revert|undo/i }),
    ).not.toBeInTheDocument();
});
