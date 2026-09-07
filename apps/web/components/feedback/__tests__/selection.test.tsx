import { act, fireEvent, renderHook } from "@testing-library/react";
import { selectionFromElement, pageChoices } from "../targets";
import { useSelection } from "../use-selection";

beforeEach(() => {
    document.body.innerHTML = `<main><section data-feedback-id="practice"><h2>Practice together</h2><a href="/join">Join</a><input value="private" /></section><div data-feedback-lesson="lesson1" data-feedback-field="content"><div><p>A lesson</p></div></div><div data-feedback-ui><button>Comment</button></div></main>`;
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as any;
});

test("records lesson identity through nested rendered text and avoids form values", () => {
    expect(
        selectionFromElement(document.querySelector("p"), "/practice")?.target,
    ).toEqual({ kind: "lesson", lessonId: "lesson1", field: "content" });
    expect(
        selectionFromElement(document.querySelector("input"), "/practice"),
    ).toBeNull();
    expect(
        selectionFromElement(document.querySelector("button"), "/practice"),
    ).toBeNull();
    expect(
        selectionFromElement(document.querySelector("a"), "/practice")?.target,
    ).toEqual({
        kind: "page",
        path: "/practice",
        componentId: "#practice",
        label: "Practice together",
    });
});

test("held modifier selects without following a link; key release and scrolling retain selection", () => {
    const { result } = renderHook(() => useSelection("/practice", false));
    const link = document.querySelector("a")!;
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(false);
    expect(result.current.selected?.label).toBe("Practice together");
    fireEvent.keyUp(window, { key: "Control" });
    fireEvent.scroll(window);
    expect(result.current.mode.kind).toBe("selected");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(result.current.mode.kind).toBe("closed");
});

test("question mark toggles persistent selection without hijacking typing", () => {
    const { result } = renderHook(() => useSelection("/practice", false));
    fireEvent.keyDown(document.querySelector("input")!, {
        key: "?",
        shiftKey: true,
    });
    expect(result.current.mode.kind).toBe("closed");
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(result.current.mode.kind).toBe("choosing");
    fireEvent.click(document.querySelector("a")!);
    expect(result.current.mode.kind).toBe("selected");
    fireEvent.click(document.querySelector("p")!);
    expect(result.current.mode.kind).toBe("closed");
});

test("keyboard chooser includes the whole page and route changes clear stale anchors", () => {
    expect(pageChoices("/practice")[0].target).toEqual({
        kind: "page",
        path: "/practice",
        componentId: "page",
        label: "Whole page",
    });
    const { result, rerender } = renderHook(
        ({ path }) => useSelection(path, false),
        { initialProps: { path: "/practice" } },
    );
    act(() =>
        result.current.setMode({
            kind: "selected",
            selection: selectionFromElement(
                document.querySelector("a"),
                "/practice",
            )!,
        }),
    );
    rerender({ path: "/other" });
    expect(result.current.selected).toBeNull();
});

test("comment dialog suspension preserves ordinary dialog clicks and keyboard input", () => {
    const { result } = renderHook(() => useSelection("/practice", true));
    const event = new MouseEvent("click", {
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
    });
    document.querySelector("p")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    fireEvent.keyDown(window, { key: "?" });
    expect(result.current.mode.kind).toBe("closed");
});
