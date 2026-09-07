import React, { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
    imageJourney,
    imagePose,
} from "../../../../../packages/page-blocks/src/blocks/anahata-hero/image-scroll-geometry";
import { useImageScroll } from "../../../../../packages/page-blocks/src/blocks/anahata-hero/use-image-scroll";
import SharedImage from "../../../../../packages/page-blocks/src/blocks/anahata-hero/shared-image";
jest.mock("@courselit/components-library", () => ({
    Link: ({
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));
jest.mock(
    "../../../../../packages/page-blocks/src/blocks/anahata-hero/use-social-rotation",
    () => ({
        useSocialRotation: () => ({
            ready: true,
            current: {
                alt: "Shown retreat photo",
                postUrl: "https://example.test/photo",
                networkDomain: "example.test",
            },
            layerA: "/shown.jpg",
            layerB: "/next.jpg",
            showA: true,
        }),
    }),
);
const cover = { left: 0, top: 86, width: 1280, height: 814 };
const target = { left: 80, top: 1070, width: 543, height: 407 };
describe("one cover image arriving at the welcome slot", () => {
    it.each([target, { left: 16, top: 940, width: 358, height: 268.5 }])(
        "lands exactly without distorting the photo",
        (destination) => {
            const journey = imageJourney(cover, destination, 900)!;
            const before = imagePose(journey, -20);
            expect(before.progress).toBe(0);
            expect(before.scale).toBe(1);
            const end = imagePose(journey, journey.endScroll + 1000);
            expect((cover.width - 2 * end.insetX) * end.scale).toBeCloseTo(
                destination.width,
            );
            expect((cover.height - 2 * end.insetY) * end.scale).toBeCloseTo(
                destination.height,
            );
            expect(cover.left + cover.width / 2 + end.x).toBeCloseTo(
                destination.left + destination.width / 2,
            );
            expect(cover.top + cover.height / 2 + end.y).toBeCloseTo(
                destination.top + destination.height / 2,
            );
            const mid = imagePose(
                journey,
                (journey.startScroll + journey.endScroll) / 2,
            );
            expect(mid.progress).toBeCloseTo(0.5);
            expect(mid.scale).toBeGreaterThan(end.scale);
        },
    );
    it("rejects an unmeasurable hidden slot", () => {
        expect(imageJourney(cover, { ...target, width: 0 }, 900)).toBeNull();
    });
    it("names and credits only the shown photo; editor uses stored fallback", () => {
        const props = {
            frameRef: { current: null },
            source: "/cover.jpg",
            alt: "Stored cover",
            fit: "cover" as const,
            position: "center" as const,
            mode: { kind: "social-rotation" as const },
            wordmark: { source: { kind: "url" as const, url: "" }, alt: "" },
            wordmarkSrc: "",
            wordmarkWidth: 835,
            editing: false,
        };
        const { rerender, container } = render(<SharedImage {...props} />);
        expect(screen.getAllByRole("img")).toHaveLength(1);
        expect(
            screen.getByRole("img", { name: "Shown retreat photo" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("link")).toHaveAttribute(
            "href",
            "https://example.test/photo",
        );
        rerender(<SharedImage {...props} editing />);
        expect(screen.getAllByRole("img")).toHaveLength(1);
        expect(
            screen.getByRole("img", { name: "Stored cover" }),
        ).toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(
            container.querySelectorAll(".anahata-hero__shared-image"),
        ).toHaveLength(1);
    });
});
function MotionHarness({ enabled = true }: { enabled?: boolean }) {
    const root = useRef<HTMLDivElement>(null),
        source = useRef<HTMLDivElement>(null),
        destination = useRef<HTMLDivElement>(null),
        image = useRef<HTMLDivElement>(null);
    useImageScroll({ root, cover: source, destination, image }, enabled);
    return (
        <div ref={root} data-testid="root">
            <div ref={source} data-testid="cover" />
            <div ref={destination} data-testid="destination">
                <div ref={image} data-testid="image" />
            </div>
        </div>
    );
}
describe("scroll lifecycle", () => {
    let reduced: boolean,
        preferenceChange: () => void,
        resize: () => void,
        frames: Map<number, FrameRequestCallback>,
        reads: jest.SpyInstance,
        disconnect: jest.Mock;
    beforeEach(() => {
        reduced = false;
        frames = new Map();
        let id = 0;
        Object.defineProperty(window, "innerHeight", {
            configurable: true,
            value: 900,
        });
        Object.defineProperty(window, "scrollY", {
            configurable: true,
            value: 0,
            writable: true,
        });
        window.matchMedia = jest.fn(() => ({
            get matches() {
                return reduced;
            },
            addEventListener: (_: string, fn: () => void) => {
                preferenceChange = fn;
            },
            removeEventListener: jest.fn(),
        })) as unknown as typeof window.matchMedia;
        disconnect = jest.fn();
        window.ResizeObserver = class {
            constructor(fn: () => void) {
                resize = fn;
            }
            observe() {}
            unobserve() {}
            disconnect = disconnect;
        } as unknown as typeof ResizeObserver;
        jest.spyOn(window, "requestAnimationFrame").mockImplementation((fn) => {
            frames.set(++id, fn);
            return id;
        });
        jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
            frames.delete(id);
        });
        reads = jest
            .spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockImplementation(function (this: HTMLElement) {
                return (
                    this.dataset.testid === "cover" ? cover : target
                ) as DOMRect;
            });
    });
    afterEach(() => jest.restoreAllMocks());
    const flush = () =>
        act(() => {
            const tasks = Array.from(frames.values());
            frames.clear();
            tasks.forEach((fn) => fn(0));
        });
    it("batches scroll paints; geometry reads happen only after layout invalidation", () => {
        const { unmount } = render(<MotionHarness />);
        expect(reads).toHaveBeenCalledTimes(2);
        const original = screen.getByTestId("image").style.transform;
        window.scrollY = 300;
        fireEvent.scroll(window);
        fireEvent.scroll(window);
        fireEvent.scroll(window);
        expect(frames.size).toBe(1);
        flush();
        expect(reads).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("image").style.transform).not.toBe(original);
        act(() => resize());
        flush();
        expect(reads).toHaveBeenCalledTimes(4);
        fireEvent.scroll(window);
        unmount();
        expect(frames.size).toBe(0);
        expect(disconnect).toHaveBeenCalled();
    });
    it("responds to reduced-motion changes and can resume", () => {
        render(<MotionHarness />);
        reduced = true;
        act(() => preferenceChange());
        expect(screen.getByTestId("root")).toHaveAttribute(
            "data-image-motion",
            "static",
        );
        expect(screen.getByTestId("image").style.transform).toBe("");
        fireEvent.scroll(window);
        expect(frames.size).toBe(0);
        reduced = false;
        act(() => preferenceChange());
        expect(screen.getByTestId("root")).toHaveAttribute(
            "data-image-motion",
            "scroll",
        );
        expect(screen.getByTestId("image").style.transform).toContain(
            "translate3d",
        );
    });
    it.each([true, false])(
        "keeps editor or initial reduced motion static (%s)",
        (editor) => {
            reduced = !editor;
            render(<MotionHarness enabled={!editor} />);
            expect(screen.getByTestId("root")).toHaveAttribute(
                "data-image-motion",
                "static",
            );
            expect(reads).not.toHaveBeenCalled();
            fireEvent.scroll(window);
            expect(frames.size).toBe(0);
        },
    );
});
