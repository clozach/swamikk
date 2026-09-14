import React from "react";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import TextEditSession from "../index";
import { fetchLeaves, submitEdit, fetchHistory } from "../api";

const refresh = jest.fn();
jest.mock("../api", () => ({
    fetchLeaves: jest.fn(),
    submitEdit: jest.fn(),
    fetchHistory: jest.fn(),
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
    fireEvent.click(screen.getByRole("button", { name: /Edit text/ }));
    await waitFor(() =>
        expect(h1().getAttribute("data-kk-editable")).toBe("heading"),
    );
    // The mode's listeners attach after the state commits; let that render land.
    await screen.findByText(/Editing text/);
    await act(async () => {});
    expect(onModeChange).toHaveBeenLastCalledWith(true);
    expect(document.documentElement.hasAttribute("data-kk-text-edit")).toBe(
        true,
    );
}

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
    expect(screen.getByRole("button", { name: /Edit text/ })).toBeTruthy();
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
    expect(screen.queryByRole("button", { name: /Edit text/ })).toBeNull();
});
