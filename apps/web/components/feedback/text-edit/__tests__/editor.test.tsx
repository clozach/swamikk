import React from "react";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import TextEditSession from "../index";
import { fetchLeaves, submitEdit, fetchHistory } from "../api";
import {
    fetchSections,
    submitSectionEdit,
    fetchSectionHistory,
} from "@/components/section-edit/api";

const refresh = jest.fn();
jest.mock("../api", () => ({
    fetchLeaves: jest.fn(),
    submitEdit: jest.fn(),
    fetchHistory: jest.fn(),
}));
jest.mock("@/components/section-edit/api", () => ({
    fetchSections: jest.fn(),
    submitSectionEdit: jest.fn(),
    fetchSectionHistory: jest.fn(),
}));
jest.mock("../../selection-tools", () => ({
    SelectionTools: ({ children, label }) => (
        <div role="toolbar" aria-label={label}>
            {children}
        </div>
    ),
}));
jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, ...props }) => <div {...props}>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
    DialogDescription: ({ children }) => <p>{children}</p>,
}));

const target = { kind: "page-widget-text", pageId: "home", widgetId: "hero" };
const leaves = {
    pageId: "home",
    revision: 1,
    widgets: [
        {
            widgetId: "hero",
            name: "anahataHero",
            shared: false,
            leaves: [
                {
                    path: "heading",
                    value: "Welcome home",
                    kind: "text",
                    source: "default",
                },
                {
                    path: "paragraphs.0.text",
                    value: "Read more now",
                    kind: "text",
                    source: "default",
                },
                {
                    path: "paragraphs.0.linkText",
                    value: "more",
                    kind: "text",
                    source: "default",
                },
            ],
        },
    ],
};
const change = (path: string, before: string, after: string) => ({
    kind: "text",
    path,
    before,
    after,
});
const applied = (changes: unknown[], undoOf?: string) => ({
    kind: "applied",
    edit: {
        editId: `edit-${JSON.stringify(changes).length}-${undoOf || "new"}`,
        target,
        widgetName: "anahataHero",
        changes,
        userId: "admin",
        at: "2026-09-13T18:00:00.000Z",
        revision: 2,
        ...(undoOf ? { undoOf } : {}),
    },
});
const onModeChange = jest.fn();
const h1 = () => document.querySelector("h1") as HTMLElement;
const para = () => document.querySelector("p") as HTMLElement;

beforeAll(() => {
    Element.prototype.getClientRects = function () {
        return [{}] as unknown as DOMRectList;
    };
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as typeof ResizeObserver;
});
beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = `<div data-feedback-page="home"><div data-feedback-id="hero" data-feedback-widget="hero"><h1>Welcome home</h1><p>Read <a href="/x">more</a> now</p></div></div>`;
    jest.mocked(fetchLeaves).mockResolvedValue(leaves as any);
    jest.mocked(fetchHistory).mockResolvedValue({
        edits: [],
        nextCursor: null,
    });
    jest.mocked(fetchSections).mockResolvedValue({
        pageId: "home",
        documentId: "page-doc",
        revision: 1,
        sections: [],
        removed: [],
    });
    jest.mocked(fetchSectionHistory).mockResolvedValue({
        edits: [],
        nextCursor: null,
    });
    Object.defineProperty(global.crypto, "randomUUID", {
        configurable: true,
        value: () => "f924bf16-8a86-4e1d-a886-6666d79d5c7b",
    });
});

async function enterMode() {
    render(
        <AppRouterContext.Provider value={{ refresh } as any}>
            <TextEditSession
                canEdit
                hidden={false}
                profile={{ userId: "admin" } as any}
                onModeChange={onModeChange}
            />
        </AppRouterContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit page/ }));
    await waitFor(() =>
        expect(h1().getAttribute("data-kk-editable")).toBe("heading"),
    );
    // The mode's listeners attach after the state commits; let that render land.
    await screen.findByText(/Editing page/);
    await act(async () => {});
    expect(onModeChange).toHaveBeenLastCalledWith(true);
    expect(document.documentElement.hasAttribute("data-kk-text-edit")).toBe(
        true,
    );
}

test.each(["keyboard", "in-place"])(
    "one journal restores a section through %s before undoing earlier text",
    async (method) => {
        const removable = {
            widgetId: "extra",
            widgetName: "richText",
            label: "Extra",
            fingerprint: "current",
            index: 1,
        };
        const removedEdit = {
            editId: "removed-extra",
            target: {
                pageId: "home",
                documentId: "page-doc",
                widgetId: "extra",
            },
            action: "remove",
            widgetName: "richText",
            label: "Extra",
            widget: { widgetId: "extra", name: "richText", settings: {} },
            position: { beforeId: "hero", afterId: null, index: 1 },
            userId: "admin",
            at: "2026-09-15T08:00:00Z",
            revision: 3,
        };
        let removed = false;
        document
            .querySelector("[data-feedback-page]")!
            .insertAdjacentHTML(
                "beforeend",
                '<div data-feedback-widget="extra"><h2>Extra section</h2></div>',
            );
        jest.mocked(fetchSections).mockImplementation(
            async () =>
                ({
                    pageId: "home",
                    documentId: "page-doc",
                    revision: 3,
                    sections: removed ? [] : [removable],
                    removed: removed ? [removedEdit] : [],
                }) as any,
        );
        jest.mocked(submitSectionEdit).mockImplementation(async (input) => {
            removed = input.action === "remove";
            return {
                kind: "applied",
                edit: removed
                    ? removedEdit
                    : {
                          ...removedEdit,
                          editId: "restored-extra",
                          action: "restore",
                          undoOf: removedEdit.editId,
                      },
            } as any;
        });
        jest.mocked(submitEdit).mockImplementation(async (input) => {
            const heading = input.changes[0].after as string;
            jest.mocked(fetchLeaves).mockResolvedValue({
                ...leaves,
                widgets: [
                    {
                        ...leaves.widgets[0],
                        leaves: [
                            { ...leaves.widgets[0].leaves[0], value: heading },
                            ...leaves.widgets[0].leaves.slice(1),
                        ],
                    },
                ],
            } as any);
            return applied(input.changes, input.undoOf) as any;
        });
        await enterMode();
        fireEvent.pointerDown(h1(), { button: 0 });
        await act(async () => {});
        h1().textContent = "Welcome back";
        fireEvent.keyDown(h1(), { key: "Enter" });
        await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
        const remove = await screen.findByRole("button", {
            name: "Remove Extra section",
        });
        await waitFor(() => expect(remove).not.toBeDisabled());
        fireEvent.click(remove);
        await waitFor(() =>
            expect(
                document.querySelector('[data-feedback-widget="extra"]'),
            ).toHaveAttribute("data-kk-section-removed"),
        );
        await waitFor(() =>
            expect(
                within(
                    screen.getByRole("toolbar", { name: "Editing page" }),
                ).getByRole("button", { name: "Undo" }),
            ).not.toBeDisabled(),
        );
        if (method === "keyboard")
            fireEvent.keyDown(window, {
                key: "z",
                code: "KeyZ",
                metaKey: true,
            });
        else
            fireEvent.click(
                within(
                    document.querySelector(
                        '[data-kk-removed-section="extra"]',
                    ) as HTMLElement,
                ).getByRole("button", { name: "Undo removal" }),
            );
        await waitFor(() => expect(submitSectionEdit).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(
                document.querySelector('[data-feedback-widget="extra"]'),
            ).not.toHaveAttribute("data-kk-section-removed"),
        );
        expect(h1().textContent).toBe("Welcome back");
        await waitFor(() =>
            expect(
                within(
                    screen.getByRole("toolbar", { name: "Editing page" }),
                ).getByRole("button", { name: "Redo" }),
            ).not.toBeDisabled(),
        );
        fireEvent.keyDown(window, { key: "z", code: "KeyZ", metaKey: true });
        await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(2));
        expect(h1().textContent).toBe("Welcome home");
        fireEvent.keyDown(window, {
            key: "z",
            code: "KeyZ",
            metaKey: true,
            repeat: true,
        });
        expect(submitSectionEdit).toHaveBeenCalledTimes(2);
    },
);

test("a click edits the run in place; Enter saves one change and leaves an undo chip", async () => {
    const first = applied([change("heading", "Welcome home", "Welcome back")]);
    jest.mocked(submitEdit).mockResolvedValueOnce(first as any);
    await enterMode();
    fireEvent.pointerDown(h1(), { button: 0 });
    await act(async () => {});
    expect(h1().hasAttribute("contenteditable")).toBe(true);
    h1().textContent = "Welcome back";
    fireEvent.keyDown(h1(), { key: "Enter" });
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    expect(submitEdit).toHaveBeenCalledWith({
        target,
        changes: [change("heading", "Welcome home", "Welcome back")],
    });
    await screen.findByRole("toolbar", { name: "Changed" });
    expect(h1().textContent).toBe("Welcome back");
    expect(h1().hasAttribute("contenteditable")).toBe(false);
    expect(refresh).toHaveBeenCalled();
    // ⌘Z reverses the saved edit through the same endpoint, naming the edit it undoes.
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied(
            [change("heading", "Welcome back", "Welcome home")],
            first.edit.editId,
        ) as any,
    );
    fireEvent.keyDown(window, { key: "z", code: "KeyZ", metaKey: true });
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(2));
    expect(jest.mocked(submitEdit).mock.calls[1][0]).toEqual({
        target,
        changes: [change("heading", "Welcome back", "Welcome home")],
        undoOf: first.edit.editId,
    });
    await waitFor(() => expect(h1().textContent).toBe("Welcome home"));
});

test("a linked paragraph edits with its link kept and saves as words plus link words", async () => {
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied([
            change(
                "paragraphs.0.text",
                "Read more now",
                "Read much more today",
            ),
            change("paragraphs.0.linkText", "more", "much more"),
        ]) as any,
    );
    await enterMode();
    expect(para().getAttribute("data-kk-kind")).toBe("linked-text");
    fireEvent.pointerDown(para(), { button: 0 });
    await act(async () => {});
    expect(para().getAttribute("contenteditable")).toBe("true");
    para().querySelector("a")!.textContent = "much more";
    para().lastChild!.nodeValue = " today";
    fireEvent.keyDown(para(), { key: "Enter" });
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    expect(submitEdit).toHaveBeenCalledWith({
        target,
        changes: [
            change(
                "paragraphs.0.text",
                "Read more now",
                "Read much more today",
            ),
            change("paragraphs.0.linkText", "more", "much more"),
        ],
    });
    // The link is still there; nothing rewrote the paragraph's markup.
    expect(para().querySelector("a")?.getAttribute("href")).toBe("/x");
    // Removing the link altogether is refused before anything is sent.
    fireEvent.pointerDown(para(), { button: 0 });
    await act(async () => {});
    para().querySelector("a")!.remove();
    fireEvent.keyDown(para(), { key: "Enter" });
    await act(async () => {});
    expect(submitEdit).toHaveBeenCalledTimes(1);
    expect(para().querySelector("a")).not.toBeNull();
    expect(
        await screen.findByText(/Keep the link as one linked phrase/),
    ).toBeTruthy();
});

test("a stale answer resyncs the run to the current text; Escape cancels an edit, then leaves the mode", async () => {
    jest.mocked(submitEdit).mockResolvedValueOnce({
        kind: "stale",
        current: [{ path: "heading", value: "Someone else's heading" }],
        message: "changed elsewhere",
    } as any);
    await enterMode();
    fireEvent.pointerDown(h1(), { button: 0 });
    await act(async () => {});
    h1().textContent = "My heading";
    fireEvent.keyDown(h1(), { key: "Enter" });
    await waitFor(() =>
        expect(h1().textContent).toBe("Someone else's heading"),
    );
    expect(await screen.findByText("changed elsewhere")).toBeTruthy();
    fireEvent.pointerDown(h1(), { button: 0 });
    await act(async () => {});
    h1().textContent = "Abandoned typing";
    fireEvent.keyDown(h1(), { key: "Escape" });
    expect(h1().textContent).toBe("Someone else's heading");
    expect(h1().hasAttribute("contenteditable")).toBe(false);
    expect(document.documentElement.hasAttribute("data-kk-text-edit")).toBe(
        true,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
        expect(document.documentElement.hasAttribute("data-kk-text-edit")).toBe(
            false,
        ),
    );
    expect(h1().hasAttribute("data-kk-editable")).toBe(false);
    expect(onModeChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: /Edit page/ })).toBeTruthy();
});

test("an unchanged edit sends nothing; History restores the red text against the current one, and says so when it already shows", async () => {
    await enterMode();
    fireEvent.pointerDown(h1(), { button: 0 });
    await act(async () => {});
    h1().textContent = "Welcome  home ";
    fireEvent.keyDown(h1(), { key: "Enter" });
    await act(async () => {});
    expect(submitEdit).not.toHaveBeenCalled();
    expect(h1().textContent).toBe("Welcome home");
    jest.mocked(fetchHistory).mockResolvedValueOnce({
        edits: [
            applied([change("heading", "Old heading", "Welcome home")])
                .edit as any,
            applied([change("heading", "Welcome home", "Elsewhere")])
                .edit as any,
        ],
        nextCursor: null,
    });
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied([change("heading", "Welcome home", "Old heading")], "x") as any,
    );
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const restore = await screen.findAllByRole("button", {
        name: "Restore the red text",
    });
    expect(restore).toHaveLength(1);
    // The second row's red text is what the page shows now, so its control says so and is inert.
    expect(
        screen.getByRole("button", {
            name: "The page already shows the red text",
        }),
    ).toBeDisabled();
    expect(screen.getAllByText("BEFORE")).toHaveLength(2);
    expect(screen.getAllByText("AFTER")).toHaveLength(2);
    fireEvent.click(restore[0]);
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    expect(jest.mocked(submitEdit).mock.calls[0][0]).toMatchObject({
        changes: [change("heading", "Welcome home", "Old heading")],
    });
    await waitFor(() => expect(h1().textContent).toBe("Old heading"));
});

test("visitors and members see nothing", () => {
    const { container } = render(
        <TextEditSession
            canEdit={false}
            hidden={false}
            onModeChange={onModeChange}
        />,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("button", { name: /Edit page/ })).toBeNull();
});
