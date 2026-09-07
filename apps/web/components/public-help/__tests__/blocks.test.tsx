import { fireEvent, render, screen, within } from "@testing-library/react";
import HelpPolicies from "../../../../../packages/page-blocks/src/blocks/help-policies/widget";
import MemberContact from "../../../../../packages/page-blocks/src/blocks/member-contact/widget";
import content from "../../../../../packages/page-blocks/src/blocks/help-policies/content";
import { helpStyles } from "../../../../../packages/page-blocks/src/blocks/help-policies/styles";
import {
    menu,
    mobileCtaHref,
} from "../../../../../packages/page-blocks/src/blocks/anahata-header/defaults";
import {
    columns,
    copyrightLinkLabel,
} from "../../../../../packages/page-blocks/src/blocks/anahata-footer/defaults";

const props = { settings: {}, state: { profile: null } } as any;
const first = () =>
    screen.getByRole("article", { name: content.terms.topics[0].title });
function policies(settings = {}) {
    return render(<HelpPolicies {...props} settings={settings} />);
}
afterEach(() => jest.restoreAllMocks());

describe("P09 policy cards", () => {
    it("shows approved summaries, keeps full text accessible on demand and links the refund sign-in destination", () => {
        policies();
        expect(
            within(first()).getByText(content.terms.topics[0].summary),
        ).toBeVisible();
        expect(
            within(first()).getByText(content.terms.topics[0].full),
        ).not.toBeVisible();
        expect(
            screen.getByRole("link", { name: "Request a refund" }),
        ).toHaveAttribute("href", "/login?redirect=%2Fdashboard%2Fmembership");
        expect(
            screen.queryByText(/No refund once a month has started/),
        ).not.toBeInTheDocument();
    });
    it("searches full text as well as headings and summaries, with a recoverable no-results state", () => {
        policies();
        fireEvent.change(screen.getByRole("searchbox"), {
            target: { value: "erase content" },
        });
        expect(screen.getAllByRole("article")).toHaveLength(1);
        expect(
            screen.getByRole("article", {
                name: content.terms.topics[1].title,
            }),
        ).toBeVisible();
        fireEvent.change(screen.getByRole("searchbox"), {
            target: { value: "no-matching-policy" },
        });
        expect(screen.queryByRole("article")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(screen.getAllByRole("article")).toHaveLength(4);
    });
    it("changes all cards between summary and full text, and resets temporary flips on scroll", () => {
        policies();
        fireEvent.click(screen.getByRole("button", { name: "Full text" }));
        expect(
            within(first()).getByText(content.terms.topics[0].full),
        ).toBeVisible();
        fireEvent.click(within(first()).getByRole("button"));
        expect(
            within(first()).getByText(content.terms.topics[0].summary),
        ).toBeVisible();
        fireEvent.scroll(window);
        expect(
            within(first()).getByText(content.terms.topics[0].full),
        ).toBeVisible();
    });
    it("reveals with a semantic button for keyboard users and an ordinary card tap", () => {
        policies();
        const button = within(first()).getByRole("button");
        button.focus();
        expect(button).toHaveFocus();
        expect(button).toHaveAttribute("type", "button");
        fireEvent.click(button);
        expect(button).toHaveAttribute("aria-expanded", "true");
        fireEvent.scroll(window);
        fireEvent.pointerDown(first(), {
            pointerType: "touch",
            clientX: 20,
            clientY: 20,
        });
        fireEvent.click(
            within(first()).getByText(content.terms.topics[0].summary),
        );
        expect(button).toHaveAttribute("aria-expanded", "true");
    });
    it("does not flip when a click ends a text selection", () => {
        policies();
        jest.spyOn(window, "getSelection").mockReturnValue({
            toString: () => "selected words",
        } as any);
        fireEvent.click(
            within(first()).getByText(content.terms.topics[0].summary),
        );
        expect(within(first()).getByRole("button")).toHaveAttribute(
            "aria-expanded",
            "false",
        );
    });
    it("does not flip after a press-and-hold even before a selection exists", () => {
        policies();
        const now = jest.spyOn(Date, "now").mockReturnValue(1000);
        fireEvent.pointerDown(first());
        now.mockReturnValue(1600);
        fireEvent.click(
            within(first()).getByText(content.terms.topics[0].summary),
        );
        expect(within(first()).getByRole("button")).toHaveAttribute(
            "aria-expanded",
            "false",
        );
    });
    it("keeps every full topic in the printable document even while search hides cards", () => {
        const { container } = policies();
        fireEvent.change(screen.getByRole("searchbox"), {
            target: { value: "no-match" },
        });
        expect(
            container.querySelectorAll(".kk-policy-card[hidden]"),
        ).toHaveLength(4);
        expect(container.querySelectorAll(".kk-policy-full")).toHaveLength(4);
        expect(helpStyles).toContain("@media print");
        expect(helpStyles).toContain(
            ".kk-policy-card[hidden],.kk-policy-card{display:block!important",
        );
        expect(helpStyles).toContain(
            ".kk-policy-full[hidden],.kk-policy-full{display:block!important",
        );
    });
    it("uses explicit native page settings and a support destination for privacy", () => {
        policies({ variant: "privacy", title: "Your privacy choices" });
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "Your privacy choices",
        );
        expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(
            screen.getByRole("link", { name: "Ask support" }),
        ).toHaveAttribute("href", "mailto:clozach+kk@gmail.com");
    });
});

describe("P10 public contact slice", () => {
    it("offers the approved inbox and existing private comments without invented phone or booking controls", () => {
        render(<MemberContact {...props} />);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "How would you like to stay in touch?",
        );
        expect(
            screen.getByRole("link", { name: "Write an email" }),
        ).toHaveAttribute("href", "mailto:clozach+kk@gmail.com");
        expect(screen.getByText(/round \? control/)).toBeInTheDocument();
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: /book|phone/i }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Open the newsletter form" }),
        ).toHaveAttribute("href", "/#stay-in-touch");
    });
    it("shows the signed-in email and routes members directly to their existing account controls", () => {
        render(
            <MemberContact
                {...props}
                state={
                    {
                        profile: {
                            userId: "member",
                            email: "member@example.com",
                        },
                    } as any
                }
            />,
        );
        expect(screen.getByText("member@example.com")).toBeVisible();
        expect(
            screen.getByRole("link", { name: /Membership and receipts/ }),
        ).toHaveAttribute("href", "/dashboard/membership");
        expect(
            screen.getByRole("link", {
                name: "Your account and news preferences",
            }),
        ).toHaveAttribute("href", "/dashboard/profile");
    });
});

describe("public navigation destinations", () => {
    it("places native membership first and retains no clickable placeholder in header or footer defaults", () => {
        expect(menu[0].href).toBe("/p/members-library-test");
        const links = (items: any[]): any[] =>
            items.flatMap((item) => [item, ...links(item.children || [])]);
        expect(
            links(menu).every((item) => item.href && item.href !== "#"),
        ).toBe(true);
        expect(mobileCtaHref).toBe("/p/contact");
        for (const column of columns) {
            const entries =
                column.kind === "links" ? column.links : column.socials;
            expect(
                entries.every((item) => item.href && item.href !== "#"),
            ).toBe(true);
        }
        expect(copyrightLinkLabel).toBe("");
    });
    it("uses an explicit Anahata cue for external header destinations and a local newsletter anchor", () => {
        for (const item of menu.filter((item) =>
            item.href.startsWith("https://"),
        ))
            expect(item.label).toMatch(/Anahata.*↗/);
        expect(menu.find((item) => item.id === "newsletter")?.href).toBe(
            "/#stay-in-touch",
        );
        expect(menu.find((item) => item.id === "contact")?.href).toBe(
            "/p/contact",
        );
    });
});
