import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import PageWidgetEditor from "../page-widget-editor";
import { feedbackRequest } from "../api";
import { textLeaves, replaceLeaf } from "../page-field-input";
import { selectionFromElement } from "../targets";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
jest.mock("@courselit/components-library", () => ({
    useMediaLit: () => ({ uploadFile: jest.fn(), isUploading: false }),
    MediaSelector: (props) => (
        <button
            type="button"
            onClick={() => props.onSelection({ mediaId: "public-photo" })}
        >
            Choose {props.access} image
        </button>
    ),
}));
jest.mock("@/components/ui/dialog", () => ({
    DialogTitle: ({ children }) => <h2>{children}</h2>,
    DialogDescription: ({ children }) => <p>{children}</p>,
}));

const fields = [
    {
        field: "heading",
        kind: "text",
        label: "Heading",
        value: "Old heading",
        defaultDerived: true,
    },
];
const props = {
    target: { pageId: "home", widgetId: "welcome" },
    profile: { userId: "admin" } as any,
    address: {} as any,
};
beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
});

test("prepares one explicit proposal and opens its review without sending approval", async () => {
    let complete: (value: unknown) => void = () => {};
    jest.mocked(feedbackRequest)
        .mockResolvedValueOnce({ fields })
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    complete = resolve;
                }),
        );
    render(<PageWidgetEditor {...props} />);
    fireEvent.change(await screen.findByLabelText("Replacement text"), {
        target: { value: "New heading" },
    });
    fireEvent.change(
        screen.getByLabelText("What should this change accomplish?"),
        { target: { value: "Clarify the welcome" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Preparing…" }));
    expect(feedbackRequest).toHaveBeenCalledTimes(2);
    expect(feedbackRequest).toHaveBeenLastCalledWith("/api/content-changes", {
        target: { kind: "page-widget", ...props.target, field: "heading" },
        patch: { kind: "text", text: "New heading" },
        summary: "Clarify the welcome",
    });
    complete({ change: { id: "proposal-one" } });
    await waitFor(() =>
        expect(push).toHaveBeenCalledWith("/dashboard/changes?id=proposal-one"),
    );
    expect(sessionStorage.length).toBe(0);
});
test("failed preparation survives close/reopen and stays separate from another actor's draft", async () => {
    jest.mocked(feedbackRequest)
        .mockResolvedValueOnce({ fields })
        .mockRejectedValueOnce(new Error("Connection lost"));
    const first = render(<PageWidgetEditor {...props} />);
    fireEvent.change(await screen.findByLabelText("Replacement text"), {
        target: { value: "Retained private draft" },
    });
    fireEvent.change(
        screen.getByLabelText("What should this change accomplish?"),
        { target: { value: "Explain welcome" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare preview" }));
    await screen.findByText(/Connection lost/);
    first.unmount();
    jest.mocked(feedbackRequest).mockResolvedValueOnce({ fields });
    const second = render(<PageWidgetEditor {...props} />);
    expect(await screen.findByLabelText("Replacement text")).toHaveValue(
        "Retained private draft",
    );
    second.unmount();
    jest.mocked(feedbackRequest).mockResolvedValueOnce({ fields });
    render(
        <PageWidgetEditor
            {...props}
            profile={{ userId: "other-admin" } as any}
        />,
    );
    expect(await screen.findByLabelText("Replacement text")).toHaveValue(
        "Old heading",
    );
});
test("closing a pending editor cannot navigate or erase a subsequently reopened draft", async () => {
    let complete: (value: unknown) => void = () => {};
    jest.mocked(feedbackRequest)
        .mockResolvedValueOnce({ fields })
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    complete = resolve;
                }),
        );
    const first = render(<PageWidgetEditor {...props} />);
    fireEvent.change(await screen.findByLabelText("Replacement text"), {
        target: { value: "First request" },
    });
    fireEvent.change(
        screen.getByLabelText("What should this change accomplish?"),
        { target: { value: "Prepare first request" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare preview" }));
    expect(screen.getByLabelText("Replacement text")).toBeDisabled();
    first.unmount();
    jest.mocked(feedbackRequest).mockResolvedValueOnce({ fields });
    render(<PageWidgetEditor {...props} />);
    fireEvent.change(await screen.findByLabelText("Replacement text"), {
        target: { value: "Later draft" },
    });
    await act(async () => {
        complete({ change: { id: "first-request" } });
    });
    expect(push).not.toHaveBeenCalled();
    expect(
        sessionStorage.getItem("page-edit:admin:home:welcome:heading"),
    ).toContain("Later draft");
});
test("image preparation uses the public native selector and submits its ID and reviewed alternative text", async () => {
    jest.mocked(feedbackRequest)
        .mockResolvedValueOnce({
            fields: [
                {
                    field: "photo",
                    kind: "image",
                    label: "Photo",
                    value: {
                        source: { kind: "url", url: "/existing.jpg" },
                        alt: "Before",
                    },
                    defaultDerived: true,
                },
            ],
        })
        .mockResolvedValueOnce({ change: { id: "image-change" } });
    render(<PageWidgetEditor {...props} />);
    fireEvent.click(
        await screen.findByRole("button", { name: "Choose public image" }),
    );
    fireEvent.change(screen.getByLabelText(/Alternative text/), {
        target: { value: "People practising" },
    });
    fireEvent.change(
        screen.getByLabelText("What should this change accomplish?"),
        { target: { value: "Update photograph" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare preview" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(feedbackRequest).toHaveBeenLastCalledWith(
        "/api/content-changes",
        expect.objectContaining({
            patch: {
                kind: "image",
                mediaId: "public-photo",
                alt: "People practising",
            },
        }),
    );
});
test("immediate text-leaf edits preserve links and embedded material without mutating the original", () => {
    const doc = {
        type: "doc" as const,
        content: [
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: "Read",
                        marks: [{ type: "link", attrs: { href: "/help" } }],
                    },
                ],
            },
            { type: "image", attrs: { src: "/existing.jpg" } },
        ],
    };
    const leaf = textLeaves(doc)[0],
        updated = replaceLeaf(doc, leaf.path, "Explore");
    expect(textLeaves(updated)[0].text).toBe("Explore");
    expect((updated.content[0] as any).content[0].marks).toEqual(
        (doc.content[0] as any).content[0].marks,
    );
    expect(updated.content[1]).toEqual(doc.content[1]);
    expect(textLeaves(doc)[0].text).toBe("Read");
});
test("page authoring anchors come from native page/widget IDs, never guessed routes or CSS locators", () => {
    document.body.innerHTML =
        '<main data-feedback-page="native-home"><div data-feedback-widget="native-widget" data-feedback-id="native-widget"><section><h2>Welcome</h2></section></div><div data-feedback-id="shared"><h3>Footer</h3></div></main>';
    expect(
        selectionFromElement(document.querySelector("h2"), "/")?.authorTarget,
    ).toEqual({ pageId: "native-home", widgetId: "native-widget" });
    expect(
        selectionFromElement(document.querySelector("h3"), "/")?.authorTarget,
    ).toBeUndefined();
});
