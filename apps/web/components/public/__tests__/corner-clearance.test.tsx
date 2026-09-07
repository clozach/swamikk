import React from "react";
import { act, render, screen } from "@testing-library/react";
import { MobilePayBar } from "../payments/order-summary";
import Footer from "../../../../../packages/page-blocks/src/blocks/anahata-footer/widget";

jest.mock("@courselit/page-primitives", () => ({
    Button: ({
        theme,
        ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { theme?: unknown }) => {
        void theme;
        return <button {...props} />;
    },
    Section: ({ children }: { children: React.ReactNode }) => (
        <section>{children}</section>
    ),
}));
jest.mock("@courselit/components-library", () => ({
    cn: (...values: string[]) => values.filter(Boolean).join(" "),
    Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));
jest.mock("@ui-lib/utils", () => ({
    getPlanPrice: () => ({ amount: 11, period: "/mo" }),
}));
const property = "--kk-mobile-pay-bar-height";
const props = {
    selectedPlan: null,
    paymentPlans: [],
    currencySymbol: "$",
    theme: { theme: {} },
    submitDisabled: false,
    isSubmitting: false,
} as unknown as React.ComponentProps<typeof MobilePayBar>;
let height = 65;
let resize: () => void;
const OriginalResizeObserver = global.ResizeObserver;
beforeEach(() => {
    height = 65;
    global.ResizeObserver = class implements ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
            resize = () => callback([], this);
        }
        observe() {}
        disconnect() {}
        unobserve() {}
    };
    jest.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
    ).mockImplementation(function (this: HTMLElement) {
        return {
            height: this.hasAttribute("data-kk-mobile-pay-bar") ? height : 0,
            width: 390,
            top: 0,
            bottom: height,
            left: 0,
            right: 390,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        };
    });
});
afterEach(() => {
    jest.restoreAllMocks();
    global.ResizeObserver = OriginalResizeObserver;
    document.documentElement.style.removeProperty(property);
});

it("reserves measured visible height, updates on resize, and clears on desktop and unmount", () => {
    const view = render(<MobilePayBar {...props} />);
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "65px",
    );
    expect(
        screen.getByRole("button", { name: "Complete Purchase" }),
    ).toHaveAttribute("type", "submit");
    expect(
        screen.getByRole("button", { name: "Complete Purchase" }),
    ).toBeEnabled();
    act(() => {
        height = 93;
        resize();
    });
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "93px",
    );
    act(() => {
        height = 0;
        resize();
    });
    expect(document.documentElement.style.getPropertyValue(property)).toBe("");
    act(() => {
        height = 65;
        resize();
    });
    view.unmount();
    expect(document.documentElement.style.getPropertyValue(property)).toBe("");
});
it("does not claim or erase a clearance belonging to another live owner", () => {
    document.documentElement.style.setProperty(property, "99px");
    const view = render(<MobilePayBar {...props} />);
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "99px",
    );
    view.unmount();
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "99px",
    );
});
it("does not overwrite a changed clearance during resize or cleanup", () => {
    const view = render(<MobilePayBar {...props} />);
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "65px",
    );
    document.documentElement.style.setProperty(property, "101px");
    act(() => {
        height = 80;
        resize();
    });
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "101px",
    );
    view.unmount();
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "101px",
    );
});
it("keeps Back to top at least 44px and below dialogs without animating its position", () => {
    render(
        <Footer
            {...({ settings: {}, editing: false } as React.ComponentProps<
                typeof Footer
            >)}
        />,
    );
    const back = screen.getByLabelText("Back To Top");
    expect(back.style.minWidth).toBe("44px");
    expect(back.style.minHeight).toBe("44px");
    // jsdom does not parse CSS max()/env(); native geometry covers clearance.
    expect(back).not.toHaveClass("transition-all");
    expect(back).toHaveClass(
        "transition-[opacity,background-color,color,box-shadow]",
    );
    expect(back).toHaveClass("z-40");
});

it("shares clearance across overlapping mounts without erasing the remaining bar", () => {
    const first = render(<MobilePayBar {...props} />);
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "65px",
    );
    height = 90;
    const second = render(<MobilePayBar {...props} />);
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "90px",
    );
    second.unmount();
    expect(document.documentElement.style.getPropertyValue(property)).toBe(
        "65px",
    );
    first.unmount();
    expect(document.documentElement.style.getPropertyValue(property)).toBe("");
});
