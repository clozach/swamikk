import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import LoginPanel from "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/login-popover";

const originalFetch = global.fetch;
describe("bounded login popover", () => {
    afterEach(() => {
        jest.restoreAllMocks();
        global.fetch = originalFetch;
        Reflect.deleteProperty(window, "visualViewport");
    });

    it("starts at 400px with doubled padding, a larger submit gap and focus in the email field", () => {
        render(
            <div>
                <LoginPanel />
            </div>,
        );
        const panel = screen.getByRole("dialog", { name: "Sign in" });
        expect(panel).toHaveClass("p-[32px]", "w-max", "overflow-auto");
        expect(panel.style.minWidth).toBe("400px");
        expect(screen.getByRole("button", { name: "Get code" })).toHaveClass(
            "mt-[40px]",
        );
        expect(
            screen.getByRole("textbox", { name: "Email address" }),
        ).toHaveFocus();
    });

    it("clamps to the visible mobile/keyboard viewport and cleans up viewport listeners", () => {
        const viewport = new EventTarget() as EventTarget & {
            width: number;
            height: number;
            offsetTop: number;
            offsetLeft: number;
        };
        Object.assign(viewport, {
            width: 390,
            height: 360,
            offsetTop: 0,
            offsetLeft: 0,
        });
        Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: viewport,
        });
        jest.spyOn(
            HTMLElement.prototype,
            "getBoundingClientRect",
        ).mockReturnValue({
            top: 35,
            bottom: 70,
            right: 370,
            left: 280,
            width: 90,
            height: 35,
            x: 280,
            y: 35,
            toJSON: () => ({}),
        });
        const remove = jest.spyOn(viewport, "removeEventListener");
        const view = render(
            <div>
                <LoginPanel />
            </div>,
        );
        const panel = screen.getByRole("dialog");
        expect(panel.style.maxWidth).toBe("366px");
        expect(panel.style.minWidth).toBe("366px");
        expect(panel.style.maxHeight).toBe("270px");
        act(() => {
            viewport.height = 260;
            viewport.dispatchEvent(new Event("resize"));
        });
        expect(panel.style.maxHeight).toBe("170px");
        view.unmount();
        expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
        Reflect.deleteProperty(window, "visualViewport");
    });

    it("wraps a long code-stage email without changing the OTP request or submitting a sign-in", async () => {
        const fetch = jest.fn().mockResolvedValue({ ok: true });
        global.fetch = fetch;
        render(
            <div>
                <LoginPanel />
            </div>,
        );
        const email = `${"long".repeat(24)}@example.org`;
        fireEvent.change(
            screen.getByRole("textbox", { name: "Email address" }),
            { target: { value: email } },
        );
        expect(
            screen.getByRole("textbox", { name: "Email address" }),
        ).toHaveAttribute("size", String(email.length + 2));
        fireEvent.submit(
            screen.getByRole("button", { name: "Get code" }).closest("form")!,
        );
        expect(
            await screen.findByRole("textbox", { name: "Sign-in code" }),
        ).toHaveFocus();
        expect(screen.getByText(email).parentElement).toHaveClass(
            "[overflow-wrap:anywhere]",
        );
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toBe(
            "/api/auth/email-otp/send-verification-otp",
        );
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
            email,
            type: "sign-in",
        });
    });
});

it.each([-800, 800])(
    "keeps panel controls in the visible viewport when the anchor is at %ipx",
    (top) => {
        const viewport = Object.assign(new EventTarget(), {
            width: 390,
            height: 100,
            offsetTop: 0,
            offsetLeft: 0,
        });
        Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: viewport,
        });
        jest.spyOn(
            HTMLElement.prototype,
            "getBoundingClientRect",
        ).mockReturnValue({
            top,
            bottom: top + 35,
            right: 370,
            left: 280,
            width: 90,
            height: 35,
            x: 280,
            y: top,
            toJSON: () => ({}),
        });
        const view = render(
            <div>
                <LoginPanel />
            </div>,
        );
        const panel = screen.getByRole("dialog");
        expect(Number.parseFloat(panel.style.top) + top).toBe(12);
        expect(panel.style.maxHeight).toBe("76px");
        expect(panel.style.padding).toBe("12px");
        expect(panel).toHaveClass("overflow-auto");
        view.unmount();
        jest.restoreAllMocks();
        Reflect.deleteProperty(window, "visualViewport");
    },
);
