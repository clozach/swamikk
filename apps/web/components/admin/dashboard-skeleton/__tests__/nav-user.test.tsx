import { fireEvent, render, screen } from "@testing-library/react";
import { NavUser } from "../nav-user";
import { ProfileContext } from "@components/contexts";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MY_CONTENT_HEADER } from "@ui-config/strings";
import { MemberMimicContext } from "@/components/member-mimic/context";

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@courselit/components-library", () => ({
    Chip: ({ children }: { children: React.ReactNode }) => (
        <span>{children}</span>
    ),
}));

function mount(profile: any, mimic: any = { kind: "inactive" }) {
    return render(
        <ProfileContext.Provider value={{ profile, setProfile: jest.fn() }}>
            <MemberMimicContext.Provider value={mimic}>
                <SidebarProvider>
                    <NavUser />
                </SidebarProvider>
            </MemberMimicContext.Provider>
        </ProfileContext.Provider>,
    );
}

test.each([
    { role: "member", permissions: [] },
    { role: "administrator", permissions: ["manage:site"] },
])(
    "offers My content in the shared signed-in $role menu",
    async ({ permissions }) => {
        mount({
            userId: "signed-in-user",
            name: "Signed In",
            email: "signed-in@example.com",
            permissions,
        });
        fireEvent.keyDown(screen.getByRole("button", { name: /Signed In/ }), {
            key: "ArrowDown",
        });

        const link = await screen.findByRole("link", {
            name: MY_CONTENT_HEADER,
        });
        expect(link).toHaveAttribute("href", "/dashboard/my-content");
        expect(screen.getAllByText(MY_CONTENT_HEADER)).toHaveLength(1);
        expect(
            screen.getByRole("link", { name: "Membership and receipts" }),
        ).toHaveAttribute("href", "/dashboard/membership");
        expect(
            screen.getByRole("link", { name: /Notifications/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /Logout/ }),
        ).toBeInTheDocument();
    },
);

test("does not expose the signed-in menu without a profile", () => {
    mount(null);
    expect(screen.queryByText(MY_CONTENT_HEADER)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("Mimic retains member navigation without private notification or account sign-out links", async () => {
    mount(
        {
            userId: "member",
            name: "Member",
            email: "member@example.com",
            permissions: [],
        },
        { kind: "active", subject: { userId: "member" } },
    );
    fireEvent.keyDown(screen.getByRole("button", { name: /Member/ }), {
        key: "ArrowDown",
    });
    expect(
        await screen.findByRole("link", { name: MY_CONTENT_HEADER }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole("link", { name: "Membership and receipts" }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole("link", { name: /Notifications/ }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole("link", { name: /Logout/ }),
    ).not.toBeInTheDocument();
});
