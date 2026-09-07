import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { SelectionTools } from "../selection-tools";
import { FeedbackControlPlacement } from "../placement";

test.each([106, 250])(
    "%ipx tools follow the actual help control through viewport pan and purchase-bar changes",
    async (width) => {
        const originalViewport = window.visualViewport;
        const originalStyle = document.documentElement.getAttribute("style");
        const viewport = Object.assign(new EventTarget(), {
            offsetLeft: 0,
            offsetTop: 0,
            width: 260,
            height: 466.666687,
        });
        Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: viewport,
        });
        const originalResizeObserver = global.ResizeObserver;
        global.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        } as typeof ResizeObserver;
        const helpRect = () => {
            const raised =
                parseFloat(
                    document.documentElement.style.getPropertyValue(
                        "--kk-mobile-pay-bar-height",
                    ),
                ) || 0;
            const left = viewport.offsetLeft + viewport.width - 60;
            const top = viewport.offsetTop + viewport.height - 60 - raised;
            return {
                x: left,
                y: top,
                left,
                top,
                right: left + 44,
                bottom: top + 44,
                width: 44,
                height: 44,
                toJSON: () => ({}),
            };
        };
        const rect = jest
            .spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockImplementation(function () {
                return this.parentElement?.classList.contains(
                    "kk-feedback-corner",
                )
                    ? helpRect()
                    : {
                          x: 0,
                          y: 0,
                          left: 0,
                          top: 0,
                          right: 0,
                          bottom: 0,
                          width: 0,
                          height: 0,
                          toJSON: () => ({}),
                      };
            });
        const measuredWidth = jest
            .spyOn(HTMLElement.prototype, "offsetWidth", "get")
            .mockImplementation(function () {
                return this.classList.contains("kk-feedback-magnet")
                    ? Math.min(width, viewport.width - 16)
                    : 44;
            });
        const measuredHeight = jest
            .spyOn(HTMLElement.prototype, "offsetHeight", "get")
            .mockReturnValue(58);
        const { unmount } = render(
            <>
                <FeedbackControlPlacement>
                    <button>Help</button>
                </FeedbackControlPlacement>
                <SelectionTools
                    target={{ left: 0, top: 566, right: 390, bottom: 1460.203 }}
                    label="Selected target"
                >
                    <button>Add a comment</button>
                    <button>Choose another component</button>
                </SelectionTools>
            </>,
        );
        const toolbar = screen.getByRole("toolbar", {
            name: "Selected target",
        });
        const check = () => {
            const left = parseFloat(toolbar.style.left),
                top = parseFloat(toolbar.style.top);
            const right = left + Math.min(width, viewport.width - 16),
                bottom = top + 58;
            const help = helpRect();
            expect(
                right <= help.left - 8 ||
                    left >= help.right + 8 ||
                    bottom <= help.top - 8 ||
                    top >= help.bottom + 8,
            ).toBe(true);
            expect(left).toBeGreaterThanOrEqual(viewport.offsetLeft);
            expect(top).toBeGreaterThanOrEqual(viewport.offsetTop);
            expect(right).toBeLessThanOrEqual(
                viewport.offsetLeft + viewport.width,
            );
            expect(bottom).toBeLessThanOrEqual(
                viewport.offsetTop + viewport.height,
            );
        };
        try {
            await waitFor(check);
            const before = toolbar.style.cssText;
            act(() =>
                document.documentElement.style.setProperty(
                    "--kk-mobile-pay-bar-height",
                    "96px",
                ),
            );
            await waitFor(() => expect(toolbar.style.cssText).not.toBe(before));
            await waitFor(check);
            act(() => {
                Object.assign(viewport, {
                    offsetLeft: 40,
                    offsetTop: 120,
                    height: 300,
                });
                viewport.dispatchEvent(new Event("scroll"));
                viewport.dispatchEvent(new Event("resize"));
            });
            await waitFor(check);
            act(() =>
                document.documentElement.style.removeProperty(
                    "--kk-mobile-pay-bar-height",
                ),
            );
            await waitFor(check);
        } finally {
            unmount();
            rect.mockRestore();
            measuredWidth.mockRestore();
            measuredHeight.mockRestore();
            global.ResizeObserver = originalResizeObserver;
            Object.defineProperty(window, "visualViewport", {
                configurable: true,
                value: originalViewport,
            });
            if (originalStyle === null)
                document.documentElement.removeAttribute("style");
            else document.documentElement.setAttribute("style", originalStyle);
        }
    },
);
