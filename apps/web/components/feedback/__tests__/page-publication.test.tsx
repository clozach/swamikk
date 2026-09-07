import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProposalReview from "../proposal-review";
import { feedbackRequest } from "../api";
import type { PagePublicationChange } from "@/services/content-changes/page-publication-types";
jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
jest.mock("@/lib/theme-styles", () => ({
    generateThemeStyles: () => ".courselit-theme {}",
}));
jest.mock("@/components/public/base-layout/template/widget-by-name", () => ({
    __esModule: true,
    default: ({ settings }) => (
        <div>
            {settings.text.content.map((node, index) => (
                <h1 key={index}>{node.content[0].text}</h1>
            ))}
        </div>
    ),
}));
jest.mock("@courselit/page-blocks", () => ({ TextRenderer: () => null }));
const change = {
    id: "publication",
    target: {
        kind: "page-publish",
        pageId: "welcome",
        creationChangeId: "creation",
    },
    version: 1,
    summary: "Publish welcome",
    patch: { kind: "page-publish" },
    baseline: {
        kind: "page-publish",
        documentId: "document",
        revision: 1,
        fingerprint: "native",
        contextFingerprint: "appearance",
    },
    preview: {
        title: "Current title",
        path: "/p/welcome",
        description: "Current description",
        robotsAllowed: false,
        layout: [
            {
                widgetId: "text",
                name: "rich-text",
                settings: {
                    text: {
                        content: [
                            { content: [{ text: "Original title heading" }] },
                            { content: [{ text: "Supplied heading" }] },
                        ],
                    },
                },
            },
        ],
        theme: {},
        typefaces: [],
        globalDrafts: { sharedWidgets: false, theme: false, typefaces: false },
    },
    previewHash: "a".repeat(64),
    state: { kind: "proposed" },
    history: [],
    approvals: [],
} as unknown as PagePublicationChange;
beforeEach(() => jest.clearAllMocks());
test("current title, body headings, route and consequences remain visible; only explicit publication approval sends version/hash", async () => {
    const onChange = jest.fn();
    (feedbackRequest as jest.Mock).mockResolvedValue({ change });
    render(<ProposalReview change={change} onChange={onChange} />);
    for (const text of [
        "Current title",
        "Original title heading",
        "Supplied heading",
        "/p/welcome",
    ])
        expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText(/Indexing discouraged/)).toBeInTheDocument();
    expect(
        screen.getByText(/does not publish shared appearance drafts/),
    ).toBeInTheDocument();
    expect(
        screen.getByText("Supplied heading").closest("[inert]"),
    ).not.toBeNull();
    expect(feedbackRequest).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole("button", { name: "Approve publication" }),
    );
    await waitFor(() =>
        expect(feedbackRequest).toHaveBeenCalledWith(
            "/api/content-changes/publication",
            { action: "approve", version: 1, previewHash: change.previewHash },
        ),
    );
    expect(onChange).toHaveBeenCalledWith(change);
});
test("pending globals are explicitly disclosed and approval is disabled until a refreshed review", async () => {
    const blocked = {
        ...change,
        preview: {
            ...change.preview,
            globalDrafts: { sharedWidgets: true, theme: true, typefaces: true },
        },
    };
    (feedbackRequest as jest.Mock).mockResolvedValue({ change });
    render(<ProposalReview change={blocked} onChange={jest.fn()} />);
    expect(
        screen.getByRole("button", { name: "Approve publication" }),
    ).toBeDisabled();
    expect(
        screen.getByText(/Shared header or footer drafts/),
    ).toBeInTheDocument();
    expect(screen.getByText(/A theme draft/)).toBeInTheDocument();
    expect(screen.getByText(/Font drafts/)).toBeInTheDocument();
    fireEvent.click(
        screen.getByRole("button", { name: "Refresh publication review" }),
    );
    await waitFor(() =>
        expect(feedbackRequest).toHaveBeenCalledWith(
            "/api/content-changes/publication",
            { action: "prepare-publication", version: 1 },
        ),
    );
});
test.each(["applying", "uncertain"])(
    "%s offers receipt recovery instead of another publication or builder",
    (kind) => {
        render(
            <ProposalReview
                change={{ ...change, state: { kind } } as PagePublicationChange}
                onChange={jest.fn()}
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Approve publication" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", {
                name: "Refresh publication review",
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("link", { name: /editor|builder/i }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /check.*result|recover/i }),
        ).toBeInTheDocument();
    },
);
test("applied publication keeps its reviewed content but offers no generic undo or builder link", () => {
    render(
        <ProposalReview
            change={
                {
                    ...change,
                    state: { kind: "applied" },
                } as PagePublicationChange
            }
            onChange={jest.fn()}
        />,
    );
    expect(screen.getByText("Supplied heading")).toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: /undo|revert|approve/i }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole("link", { name: /editor|builder/i }),
    ).not.toBeInTheDocument();
});
