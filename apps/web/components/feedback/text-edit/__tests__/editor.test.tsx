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
            ],
        },
    ],
};
const applied = (before: string, after: string, undoOf?: string) => ({
    kind: "applied",
    edit: {
        editId: `edit-${after}`,
        target: {
            kind: "page-widget-text",
            pageId: "home",
            widgetId: "hero",
            path: "heading",
        },
        widgetName: "anahataHero",
        before,
        after,
        userId: "admin",
        at: "2026-09-13T18:00:00.000Z",
        revision: 2,
        ...(undoOf ? { undoOf } : {}),
    },
});
const onModeChange = jest.fn();
const h1 = () => document.querySelector("h1") as HTMLElement;

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
    document.body.innerHTML = `<div data-feedback-page="home"><div data-feedback-id="hero" data-feedback-widget="hero"><h1>Welcome home</h1></div></div>`;
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

test("a click edits the run in place; Enter saves the exact before/after and leaves an undo chip", async () => {
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied("Welcome home", "Welcome back") as any,
    );
    await enterMode();
    fireEvent.pointerDown(h1(), { button: 0 });
    await act(async () => {});
    expect(h1().hasAttribute("contenteditable")).toBe(true);
    h1().textContent = "Welcome back";
    fireEvent.keyDown(h1(), { key: "Enter" });
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    expect(submitEdit).toHaveBeenCalledWith({
        target: {
            kind: "page-widget-text",
            pageId: "home",
            widgetId: "hero",
            path: "heading",
        },
        before: "Welcome home",
        after: "Welcome back",
    });
    await screen.findByRole("toolbar", { name: "Changed" });
    expect(h1().textContent).toBe("Welcome back");
    expect(h1().hasAttribute("contenteditable")).toBe(false);
    expect(refresh).toHaveBeenCalled();
    // ⌘Z reverses the saved edit through the same endpoint, naming the edit it undoes.
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied("Welcome back", "Welcome home", "edit-Welcome back") as any,
    );
    fireEvent.keyDown(window, { key: "z", code: "KeyZ", metaKey: true });
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(2));
    expect(jest.mocked(submitEdit).mock.calls[1][0]).toEqual({
        target: {
            kind: "page-widget-text",
            pageId: "home",
            widgetId: "hero",
            path: "heading",
        },
        before: "Welcome back",
        after: "Welcome home",
        undoOf: "edit-Welcome back",
    });
    await waitFor(() => expect(h1().textContent).toBe("Welcome home"));
});

test("a stale answer resyncs the run to the current text; Escape cancels an edit, then leaves the mode", async () => {
    jest.mocked(submitEdit).mockResolvedValueOnce({
        kind: "stale",
        current: "Someone else's heading",
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

test("an unchanged edit sends nothing; History restores an earlier text against the current one", async () => {
    await enterMode();
    fireEvent.pointerDown(h1(), { button: 0 });
    await act(async () => {});
    h1().textContent = "Welcome  home ";
    fireEvent.keyDown(h1(), { key: "Enter" });
    await act(async () => {});
    expect(submitEdit).not.toHaveBeenCalled();
    expect(h1().textContent).toBe("Welcome home");
    jest.mocked(fetchHistory).mockResolvedValueOnce({
        edits: [applied("Old heading", "Welcome home").edit as any],
        nextCursor: null,
    });
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied("Welcome home", "Old heading", "edit-Welcome home") as any,
    );
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(
        await screen.findByRole("button", { name: "Restore this text" }),
    );
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    expect(jest.mocked(submitEdit).mock.calls[0][0]).toMatchObject({
        before: "Welcome home",
        after: "Old heading",
        undoOf: "edit-Welcome home",
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
