import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DesktopNavItem from "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/desktop-nav";
import TopBar from "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/top-bar";
import Footer from "../../../../../packages/page-blocks/src/blocks/anahata-footer/widget";
import PrivateSessions from "../../../../../packages/page-blocks/src/blocks/anahata-private-sessions/widget";
import MobileOverlay from "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/mobile-overlay";
import {
    FLYOUT_PANEL,
    ACCOUNT_MENU,
} from "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/tokens";

jest.mock("@courselit/components-library", () => ({
    ...jest.requireActual(
        "../../../../../packages/components-library/src/external-link",
    ),
    cn: (...values: string[]) => values.filter(Boolean).join(" "),
    Link: jest.requireActual(
        "../../../../../packages/components-library/src/link",
    ).default,
}));
jest.mock("@courselit/page-primitives", () => ({
    Section: ({ children }: { children: React.ReactNode }) => (
        <section>{children}</section>
    ),
}));
jest.mock(
    "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/account-control",
    () => ({ MobileAccountSection: () => null }),
);
jest.mock("next/link", () => ({
    __esModule: true,
    default: ({
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));
const external = {
    id: "visit",
    label: "Visit Anahata ↗",
    href: "https://www.anahata-retreat.org.nz/stay",
};
const expectExternal = (link: HTMLElement) => {
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.querySelectorAll("sup")).toHaveLength(1);
};

it("applies the same native external rule to desktop navigation and top utility links", () => {
    render(
        <>
            <ul>
                <DesktopNavItem item={external} />
            </ul>
            <TopBar left={[external]} right={[]} />
        </>,
    );
    screen
        .getAllByRole("link", { name: "Visit Anahata (opens in a new tab)" })
        .forEach(expectExternal);
});
it("preserves placeholder submenu taps while external destinations remain real links", () => {
    render(
        <ul>
            <DesktopNavItem
                item={{
                    id: "menu",
                    label: "Explore",
                    href: "#",
                    children: [external],
                }}
            />
        </ul>,
    );
    const trigger = screen.getByRole("link", { name: "Explore" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).not.toHaveAttribute("target");
    expectExternal(
        screen.getByRole("link", {
            name: "Visit Anahata (opens in a new tab)",
        }),
    );
});
it("uses protected footer destinations without making mailto open a browser tab", () => {
    render(
        <Footer
            {...({ settings: {}, editing: false } as React.ComponentProps<
                typeof Footer
            >)}
        />,
    );
    expectExternal(
        screen.getByRole("link", { name: "Stay (opens in a new tab)" }),
    );
    const mail = screen.getByRole("link", { name: "clozach+kk@gmail.com" });
    expect(mail).toHaveAttribute("href", "mailto:clozach+kk@gmail.com");
    expect(mail).not.toHaveAttribute("target");
});
it("opens the actual Private Sessions website separately even with the legacy false default, while builder clicks remain inert", () => {
    const props = {
        settings: {
            buttonAction: external.href,
            buttonCaption: "Private Sessions",
            buttonOpensInNewTab: false,
        },
        state: {
            theme: {
                theme: {
                    structure: {
                        page: { width: 1000 },
                        section: { padding: { y: 40 } },
                    },
                },
            },
        },
        editing: true,
    } as unknown as React.ComponentProps<typeof PrivateSessions>;
    render(<PrivateSessions {...props} />);
    const link = screen.getByRole("link", {
        name: "Private Sessions (opens in a new tab)",
    });
    expectExternal(link);
    expect(fireEvent.click(link)).toBe(false);
});
it("keeps global mobile layers below standard dialogs and normalizes local public panels", () => {
    render(
        <MobileOverlay
            state={{ kind: "open" }}
            onClose={jest.fn()}
            menu={[external]}
            profile={undefined}
            utilityItems={[]}
            closeLabel="Close menu"
        />,
    );
    expect(screen.getByRole("dialog", { name: "Site menu" })).toHaveClass(
        "z-[41]",
    );
    expect(document.querySelector(".z-40")).not.toBeNull();
    expectExternal(
        screen.getByRole("link", {
            name: "Visit Anahata (opens in a new tab)",
        }),
    );
    expect(FLYOUT_PANEL).toContain("z-[42]");
    expect(ACCOUNT_MENU).toContain("z-[42]");
});

it("defers to a higher dialog then restores the menu keyboard and focus trap", () => {
    jest.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(
        document.body,
    );
    jest.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
        { width: 300, height: 200 },
    ] as unknown as DOMRectList);
    const close = jest.fn();
    const view = render(
        <>
            <button>Outside</button>
            <MobileOverlay
                state={{ kind: "open" }}
                onClose={close}
                menu={[external]}
                profile={undefined}
                utilityItems={[]}
                closeLabel="Close menu"
            />
        </>,
    );
    const menuClose = screen.getByRole("button", { name: "Close menu" });
    expect(menuClose).toHaveFocus();
    const higher = document.createElement("div");
    higher.setAttribute("role", "dialog");
    higher.setAttribute("data-state", "open");
    higher.style.zIndex = "50";
    higher.innerHTML = '<textarea aria-label="Draft comment"></textarea>';
    document.body.append(higher);
    const textarea = higher.querySelector("textarea")!;
    higher.style.zIndex = "30";
    textarea.focus();
    expect(menuClose).toHaveFocus();
    higher.style.zIndex = "50";
    higher.setAttribute("data-state", "closed");
    textarea.focus();
    expect(menuClose).toHaveFocus();
    higher.setAttribute("data-state", "open");
    textarea.focus();
    expect(textarea).toHaveFocus();
    for (const key of ["a", "Tab", "Escape"]) {
        expect(fireEvent.keyDown(textarea, { key })).toBe(true);
    }
    expect(close).not.toHaveBeenCalled();
    higher.remove();
    screen.getByRole("button", { name: "Outside" }).focus();
    expect(menuClose).toHaveFocus();
    expect(fireEvent.keyDown(menuClose, { key: "Tab" })).toBe(false);
    expect(
        screen.getByRole("link", {
            name: "Visit Anahata (opens in a new tab)",
        }),
    ).toHaveFocus();
    fireEvent.keyDown(menuClose, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
    view.unmount();
    jest.restoreAllMocks();
});
