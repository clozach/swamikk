import {
    act,
    fireEvent,
    render,
    renderHook,
    screen,
} from "@testing-library/react";
import { useVisualViewport } from "../viewport";
import { FeedbackControlPlacement } from "../placement";

class VisibleViewport extends EventTarget {
    offsetLeft = 0;
    offsetTop = 0;
    width = 390;
    height = 700;
}
let viewport: VisibleViewport;
const original = window.visualViewport;
beforeEach(() => {
    viewport = new VisibleViewport();
    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: viewport,
    });
});
afterEach(() =>
    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: original,
    }),
);

test("keyboard resize and pinch-pan events move the corner within the actually visible area", () => {
    render(
        <FeedbackControlPlacement>
            <button>Comment</button>
        </FeedbackControlPlacement>,
    );
    const container = screen.getByRole("button", {
        name: "Comment",
    }).parentElement!;
    expect(container).toHaveStyle({
        left: "0px",
        top: "0px",
        width: "390px",
        height: "700px",
    });
    act(() => {
        Object.assign(viewport, {
            offsetLeft: 80,
            offsetTop: 240,
            width: 195,
            height: 240,
        });
        viewport.dispatchEvent(new Event("resize"));
    });
    expect(container).toHaveStyle({
        left: "80px",
        top: "240px",
        width: "195px",
        height: "240px",
    });
    act(() => {
        viewport.offsetTop = 300;
        viewport.dispatchEvent(new Event("scroll"));
    });
    expect(container).toHaveStyle({ top: "300px" });
});

test("viewport listeners are released with their owner and absence falls back to window size", () => {
    const remove = jest.spyOn(viewport, "removeEventListener");
    const first = renderHook(useVisualViewport);
    first.unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: null,
    });
    const fallback = renderHook(useVisualViewport);
    fireEvent(window, new Event("resize"));
    expect(fallback.result.current).toEqual({
        left: 0,
        top: 0,
        width: innerWidth,
        height: innerHeight,
    });
});
