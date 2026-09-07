import React from "react";
import {
    fireEvent,
    render,
    screen,
    within,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider, SidebarInset } from "@components/ui/sidebar";
import { AppSidebar } from "../dashboard-skeleton/app-sidebar";
import Releases from "@/app/(with-contexts)/dashboard/(sidebar)/releases/page";
import Changes from "@/app/(with-contexts)/dashboard/(sidebar)/changes/page";
import RefundReview from "@/app/(with-contexts)/dashboard/(sidebar)/refund-review/page";
import { ProfileContext } from "@components/contexts";
import type { Profile } from "@courselit/common-models";

let mockPath = "/dashboard/releases";

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
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
jest.mock("next/navigation", () => ({
    usePathname: () => mockPath,
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/app/(with-contexts)/dashboard/(sidebar)/action", () => ({
    getSetupChecklist: async () => undefined,
}));
jest.mock("@/lib/utils", () => ({
    ...jest.requireActual("@/lib/shadcn-utils"),
    hasPermissionToAccessSetupChecklist: () => false,
}));
jest.mock("@courselit/components-library", () => ({
    Image: () => null,
    Chip: ({ children }: { children: React.ReactNode }) => (
        <span>{children}</span>
    ),
}));
jest.mock("@components/notifications-viewer", () => ({
    NotificationsViewer: () => null,
}));
jest.mock(
    "../next-theme-switcher",
    () =>
        function ThemeControl() {
            return <button>Toggle theme</button>;
        },
);
jest.mock("../dashboard-skeleton/nav-user", () => ({
    NavUser: () => <button>Account</button>,
}));
jest.mock(
    "@/components/drip-admin/drip-admin",
    () =>
        function ReleaseBody() {
            return <main>Release content</main>;
        },
);
jest.mock(
    "@components/feedback/review-hub",
    () =>
        function ChangesBody() {
            return <main>Changes content</main>;
        },
);
jest.mock(
    "@/components/refund-requests/operator",
    () =>
        function RefundBody() {
            return <main>Refund content</main>;
        },
);

test.each([Releases, Changes, RefundReview])(
    "review route %p exposes the real phone navigation and keyboard exit",
    async (Page) => {
        const user = userEvent.setup();
        mockPath = "/dashboard/releases";
        const tree = () => (
            <ProfileContext.Provider
                value={{
                    profile: {
                        userId: "admin",
                        permissions: ["site:manage", "setting:manage"],
                    } as Partial<Profile>,
                    setProfile: jest.fn(),
                }}
            >
                <SidebarProvider>
                    <AppSidebar />
                    <SidebarInset>
                        <Page />
                    </SidebarInset>
                </SidebarProvider>
            </ProfileContext.Provider>
        );
        const { rerender } = render(tree());
        const toggle = screen.getByRole("button", { name: "Toggle Sidebar" });
        toggle.focus();
        await user.keyboard("{Enter}");
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAccessibleName("Navigation menu");
        expect(dialog).toHaveAccessibleDescription(
            "Choose a page in your account.",
        );
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
        expect(
            within(dialog).getByRole("link", { name: "Comments & changes" }),
        ).toHaveAttribute("href", "/dashboard/changes");
        expect(
            within(dialog).getByRole("link", { name: "Refund review" }),
        ).toHaveAttribute("href", "/dashboard/refund-review");
        expect(
            within(dialog).getByRole("button", { name: "Account" }),
        ).toBeInTheDocument();
        await user.keyboard("{Tab}");
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(toggle).toHaveFocus());
        // The same trigger remains usable after the Sheet closes.
        fireEvent.click(toggle);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        mockPath = "/dashboard/changes";
        rerender(tree());
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    },
);
