import { fireEvent, render, screen } from "@testing-library/react";
import MemberMimicLink from "../link";
import { MemberMimicContext } from "../context";
import { ProfileContext } from "@/components/contexts";
import { safeMimicReturnTo } from "@/services/member-mimic/constants";
import { readMemberListReturn } from "../list-return";
import StartMemberMimic from "../start";
import { waitFor } from "@testing-library/react";

let path = "/dashboard/cohorts/cohort-one";
jest.mock("next/navigation", () => ({ usePathname: () => path }));

function mount(
    userId: string | null = "member-one",
    permissions = ["user:manage"],
    kind = "inactive",
) {
    return render(
        <ProfileContext.Provider
            value={{ profile: { userId: "admin", permissions } } as any}
        >
            <MemberMimicContext.Provider value={{ kind } as any}>
                <MemberMimicLink userId={userId}>Member One</MemberMimicLink>
            </MemberMimicContext.Provider>
        </ProfileContext.Provider>,
    );
}

test("the member entry preserves its cohort and current query without granting or submitting as the member", () => {
    window.history.replaceState(null, "", `${path}?tab=members`);
    mount();
    const link = screen.getByRole("link", { name: "Member One" });
    fireEvent.click(link, { ctrlKey: true });
    const url = new URL(link.getAttribute("href")!, window.location.origin);
    expect(url.pathname).toBe("/dashboard/users/member-one");
    expect(url.searchParams.get("returnTo")).toBe(`${path}?tab=members`);
});

test.each([
    [null, ["user:manage"], "inactive"],
    ["member", ["course:manage"], "inactive"],
    ["member", ["user:manage"], "active"],
    ["member", ["user:manage"], "expired"],
])(
    "missing identity/permission and Mimic stay plain text (%s, %j, %s)",
    (id, permissions, kind) => {
        mount(id as string | null, permissions as string[], kind as string);
        expect(screen.getByText("Member One")).toBeVisible();
        expect(screen.queryByRole("link")).toBeNull();
    },
);

test.each([
    "/dashboard/overview",
    "/dashboard/support",
    "/dashboard/cohorts/cohort-one?tab=members",
    "/dashboard/subscribers?page=3",
    "/dashboard/transactions",
    "/dashboard/product/product-one/customers?search=one",
    "/dashboard/product/product-one/transactions",
    "/dashboard/users?search=one&page=3",
])("return permits only known member lists: %s", (value) => {
    expect(safeMimicReturnTo(value)).toBe(value);
});

test.each([
    "https://elsewhere.example/dashboard/users",
    "//elsewhere.example/dashboard/users",
    "/dashboard/users/member-one",
    "/dashboard/profile",
    "/dashboard/cohorts/one/delete",
    "/dashboard/product/one/manage",
    "/dashboard/cohorts/one%2ftwo",
    "/dashboard/subscribers#private",
])(
    "unsafe return falls back without expanding Mimic member routes: %s",
    (value) => {
        expect(safeMimicReturnTo(value)).toBe("/dashboard/users");
    },
);

test("the shared start sends the source list to the existing authorized endpoint and keeps it on failed entry", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Unavailable member" } }),
    });
    global.fetch = mockFetch;
    render(
        <StartMemberMimic
            userId="member-one"
            returnTo="/dashboard/cohorts/cohort-one?tab=members"
        />,
    );
    await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Unavailable member",
        ),
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
        userId: "member-one",
        returnTo: "/dashboard/cohorts/cohort-one?tab=members",
    });
    expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/dashboard/cohorts/cohort-one?tab=members",
    );
});

test("list return keeps filters/page/search and refuses malformed copied controls", () => {
    const filter = {
        aggregator: "and",
        filters: [{ name: "email", condition: "Contains", value: "member" }],
    };
    expect(
        readMemberListReturn(
            `?${new URLSearchParams({ page: "3", filters: JSON.stringify(filter), search: "Member One" })}`,
        ),
    ).toEqual({ page: 3, filter, search: "Member One" });
    expect(readMemberListReturn("?page=-5&filters=%7Bbad")).toEqual({
        page: 1,
        filter: { aggregator: "or", filters: [] },
        search: "",
    });
});
