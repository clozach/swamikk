import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { useTextEdit } from "../../feedback/text-edit/use-text-edit";
import { fetchLeaves, submitEdit } from "../../feedback/text-edit/api";
import type { TextEdit } from "@courselit/common-models";

jest.mock("../../feedback/text-edit/api", () => ({
    fetchLeaves: jest.fn(),
    submitEdit: jest.fn(),
}));
beforeEach(() => {
    jest.resetAllMocks();
});

it("a text undo transport failure releases the shared editor so the same undo can be retried", async () => {
    document.body.innerHTML =
        '<div data-feedback-page="home"><div data-feedback-widget="hero">Welcome</div></div>';
    (fetchLeaves as jest.Mock).mockResolvedValue({
        pageId: "home",
        revision: 1,
        widgets: [],
    });
    const text: TextEdit = {
        editId: "text-before-removal",
        target: { kind: "page-widget-text", pageId: "home", widgetId: "hero" },
        widgetName: "anahataHero",
        changes: [
            {
                kind: "text",
                path: "heading",
                before: "Hello",
                after: "Welcome",
            },
        ],
        userId: "admin",
        at: "2026-09-15T09:00:00Z",
        revision: 1,
    };
    const { result } = renderHook(() => useTextEdit(true));
    await act(async () => {
        await result.current.start();
    });
    // Seed the shared journal through its exposed record seam; no text DOM manipulation is needed.
    act(() => result.current.recordSectionEdit(text as never));
    (submitEdit as jest.Mock).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
        await result.current.undo();
    });
    (submitEdit as jest.Mock).mockResolvedValue({
        kind: "applied",
        edit: {
            ...text,
            editId: "undone",
            changes: [
                {
                    kind: "text",
                    path: "heading",
                    before: "Welcome",
                    after: "Hello",
                },
            ],
        },
    });
    await act(async () => {
        await result.current.undo();
    });
    expect(submitEdit).toHaveBeenCalledTimes(2);
    expect(result.current.canRedo).toBe(true);
});

it("a failed text save clears its pending marker and permits editing and saving again", async () => {
    document.body.innerHTML =
        '<div data-feedback-page="home"><div data-feedback-id="hero" data-feedback-widget="hero"><h1>Welcome</h1></div></div>';
    Element.prototype.getClientRects = function () {
        return [{}] as unknown as DOMRectList;
    };
    (fetchLeaves as jest.Mock).mockResolvedValue({
        pageId: "home",
        revision: 1,
        widgets: [
            {
                widgetId: "hero",
                name: "anahataHero",
                shared: false,
                leaves: [
                    {
                        kind: "text",
                        path: "heading",
                        value: "Welcome",
                        source: "settings",
                    },
                ],
            },
        ],
    });
    const { result } = renderHook(() => useTextEdit(true));
    await act(async () => {
        await result.current.start();
    });
    const heading = document.querySelector("h1")!;
    (submitEdit as jest.Mock).mockRejectedValueOnce(new Error("offline"));
    fireEvent.pointerDown(heading);
    expect(result.current.editing).not.toBeNull();
    heading.textContent = "Changed";
    fireEvent.blur(heading);
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(heading).not.toHaveAttribute("data-kk-saving");
    expect(result.current.notice?.text).toMatch(/connection dropped/i);
    fireEvent.pointerDown(heading);
    expect(result.current.editing).not.toBeNull();
    heading.textContent = "Saved next";
    (submitEdit as jest.Mock).mockResolvedValue({
        kind: "applied",
        edit: {
            editId: "saved",
            target: {
                kind: "page-widget-text",
                pageId: "home",
                widgetId: "hero",
            },
            widgetName: "anahataHero",
            changes: [
                {
                    kind: "text",
                    path: "heading",
                    before: "Welcome",
                    after: "Saved next",
                },
            ],
            userId: "admin",
            at: "2026-09-15T09:00:00Z",
            revision: 2,
        },
    });
    fireEvent.blur(heading);
    await waitFor(() => expect(result.current.chip?.edit.editId).toBe("saved"));
    expect(result.current.canUndo).toBe(true);
});
