import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import Link from "../../../../../packages/components-library/src/link";
import {
    externalLinkProps,
    ExternalLinkLabel,
} from "../../../../../packages/components-library/src/external-link";

jest.mock("next/link", () => ({
    __esModule: true,
    default: ({
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));

describe("ordinary external navigation", () => {
    it.each([
        "https://www.anahata-retreat.org.nz/stay",
        "http://example.org/visit",
        "//example.org/visit",
    ])("uses native protected new-tab behavior for %s", (href) => {
        const click = jest.fn();
        render(
            <Link href={href} onClick={click}>
                Stay ↗
            </Link>,
        );
        const link = screen.getByRole("link", {
            name: "Stay (opens in a new tab)",
        });
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
        expect(link.querySelectorAll("sup")).toHaveLength(1);
        expect(link.querySelector("sup")).toHaveAttribute(
            "aria-hidden",
            "true",
        );
        expect(link.querySelector("sup")).toHaveClass(
            "text-[0.65em]",
            "align-super",
        );
        // No scripted window.open/location assignment consumes modifier/native behavior.
        expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
        expect(click).toHaveBeenCalledTimes(1);
    });

    it.each([
        "/p/contact",
        "/dashboard/profile",
        "#stay-in-touch",
        "mailto:help@example.org",
        "tel:+640000000",
    ])("preserves the native same-tab/action destination %s", (href) => {
        render(<Link href={href}>Continue</Link>);
        expect(screen.getByRole("link")).not.toHaveAttribute("target");
        expect(screen.getByRole("link")).toHaveAttribute("href", href);
    });

    it("preserves deliberate same-tab provider/auth redirects and file downloads", () => {
        render(
            <>
                <Link href="https://checkout.stripe.com/session" openInSameTab>
                    Payment
                </Link>
                <Link
                    href="https://identity.example.org/authorize"
                    openInSameTab
                >
                    Sign in
                </Link>
                <Link href="https://media.example.org/file.pdf" download>
                    Download
                </Link>
            </>,
        );
        for (const link of screen.getAllByRole("link"))
            expect(link).not.toHaveAttribute("target");
        expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
            "download",
        );
    });

    it("keeps an explicit internal new-tab choice and mail/hash actions distinct", () => {
        expect(
            externalLinkProps("/p/contact", { openInSameTab: false }),
        ).toEqual({ target: "_blank", rel: "noopener noreferrer" });
        expect(
            externalLinkProps("mailto:help@example.org", {
                openInSameTab: false,
            }),
        ).toEqual({});
        expect(externalLinkProps("#section", { openInSameTab: false })).toEqual(
            {},
        );
    });

    it("does not attach a visible arrow to an image or icon-only child", () => {
        render(
            <ExternalLinkLabel newTab>
                <img src="/image.png" alt="A gathering" />
            </ExternalLinkLabel>,
        );
        expect(document.querySelector("sup")).toBeNull();
        expect(screen.getByText("(opens in a new tab)")).toHaveClass("sr-only");
    });
});
