import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LifeBuoy, Settings } from "lucide-react";
import { SidebarMenu, SidebarProvider } from "@/components/ui/sidebar";
import { NavItem, type NavItemData } from "../nav-item";

jest.mock("next/link", () => {
    const React = require("react");
    return React.forwardRef(function TestLink(
        { children, ...props }: React.ComponentProps<"a">,
        ref: React.Ref<HTMLAnchorElement>,
    ) {
        return (
            <a ref={ref} {...props}>
                {children}
            </a>
        );
    });
});
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@courselit/components-library", () => ({
    Chip: ({ children }: { children: React.ReactNode }) => (
        <span>{children}</span>
    ),
}));

const settings: NavItemData = {
    title: "Settings",
    url: "/dashboard/settings?tab=General",
    icon: Settings,
    items: [
        { title: "General", url: "/dashboard/settings?tab=General" },
        { title: "Payment", url: "/dashboard/settings?tab=Payment" },
    ],
};

function mount(item: NavItemData, open: boolean) {
    return render(
        <SidebarProvider defaultOpen={open}>
            <SidebarMenu>
                <NavItem item={item} />
            </SidebarMenu>
        </SidebarProvider>,
    );
}

test("in the collapsed rail an entry with pages opens them beside its icon", async () => {
    const user = userEvent.setup();
    mount(settings, false);
    expect(screen.queryByRole("link", { name: "General" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(
        await screen.findByRole("menuitem", { name: "General" }),
    ).toHaveAttribute("href", "/dashboard/settings?tab=General");
    expect(screen.getByRole("menuitem", { name: "Payment" })).toHaveAttribute(
        "href",
        "/dashboard/settings?tab=Payment",
    );
});

test("in the expanded sidebar an entry with pages unfolds them in place", async () => {
    const user = userEvent.setup();
    mount(settings, true);
    expect(screen.queryByRole("link", { name: "General" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(
        await screen.findByRole("link", { name: "General" }),
    ).toHaveAttribute("href", "/dashboard/settings?tab=General");
    expect(screen.queryByRole("menu")).toBeNull();
});

test("an entry without pages is one link", () => {
    mount(
        { title: "Support", url: "/dashboard/support", icon: <LifeBuoy /> },
        false,
    );
    expect(screen.getByRole("link", { name: "Support" })).toHaveAttribute(
        "href",
        "/dashboard/support",
    );
});
