import React from "react";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import UsersHub, { adminSummary } from "../users-hub";
import { AddressContext, ProfileContext } from "@components/contexts";

const mockExec = jest.fn();
const mockSetPayload = jest.fn();
jest.mock("next/navigation", () => ({
    usePathname: () => "/dashboard/users",
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("@courselit/utils", () => ({
    ...jest.requireActual("@courselit/utils"),
    FetchBuilder: jest.fn().mockImplementation(() => ({
        setUrl: jest.fn().mockReturnThis(),
        setPayload: mockSetPayload.mockReturnThis(),
        setIsGraphQLEndpoint: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnThis(),
        exec: mockExec,
    })),
}));
jest.mock("@components/admin/dashboard-content", () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));
jest.mock("@components/admin/users/filter-container", () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock("@components/public/pagination", () => ({
    PaginationControls: () => null,
}));
jest.mock("@courselit/components-library", () => {
    const Wrap = ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    );
    return {
        Avatar: Wrap,
        AvatarFallback: Wrap,
        AvatarImage: ({ src, alt }: { src?: string; alt?: string }) =>
            src ? <img src={src} alt={alt} /> : null,
        Badge: ({ children }: { children?: React.ReactNode }) => (
            <span>{children}</span>
        ),
        TableBody: ({ children }: { children?: React.ReactNode }) => (
            <tbody>{children}</tbody>
        ),
        Skeleton: () => <div />,
        useToast: () => ({ toast: jest.fn() }),
    };
});

const users = [
    {
        userId: "u1",
        email: "karuna@example.com",
        name: "Karuna",
        active: true,
        permissions: ["course:enroll", "user:manage", "site:manage"],
        createdAt: "2026-07-01",
        updatedAt: "2026-07-01",
        content: [],
    },
    {
        userId: "u2",
        email: "second.member@example.com",
        name: "Second Member",
        active: true,
        permissions: ["course:enroll", "media:manage"],
        createdAt: "2026-08-01",
        updatedAt: "2026-08-02",
        content: [],
    },
    {
        userId: "u3",
        email: "third.member@example.com",
        name: "",
        active: false,
        permissions: ["course:enroll"],
        createdAt: "2026-08-03",
        updatedAt: "2026-08-03",
        content: [],
    },
];

function renderHub() {
    return render(
        <AddressContext.Provider
            value={{ backend: "http://example.test", frontend: "" }}
        >
            <ProfileContext.Provider
                value={{
                    profile: {
                        userId: "me",
                        email: "me@example.com",
                        permissions: ["user:manage"],
                    } as any,
                    setProfile: jest.fn(),
                }}
            >
                <UsersHub />
            </ProfileContext.Provider>
        </AddressContext.Provider>,
    );
}

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as typeof ResizeObserver;
});
beforeEach(() => {
    mockExec.mockReset();
    mockSetPayload.mockClear();
    mockExec.mockResolvedValue({ users, count: users.length });
});

test("adminSummary lists the admin-level captions in the editor's order and nothing for a member", () => {
    expect(
        adminSummary(["site:manage", "course:enroll", "user:manage"]),
    ).toEqual(["Manage pages", "Manage users"]);
    expect(adminSummary(["course:enroll", "media:manage"])).toEqual([]);
});

const rowsOnScreen = () => screen.getAllByRole("row", { name: /Select/ });
/** The list has settled once its first row holds the keyboard. */
const settledRows = async () => {
    await waitFor(() =>
        expect(rowsOnScreen()[0]).toHaveAttribute("tabindex", "0"),
    );
    return rowsOnScreen();
};

test("rows show what an account may manage, take the keyboard, and sprout the magnet on focus", async () => {
    renderHub();
    const rows = await settledRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(
        "May manage: Manage pages · Manage users",
    );
    expect(rows[1]).not.toHaveTextContent("May manage");
    // One Tab stop: the first row is reachable, the rest follow with arrows.
    expect(rows[0]).toHaveAttribute("tabindex", "0");
    expect(rows[1]).toHaveAttribute("tabindex", "-1");

    act(() => rows[0].focus());
    expect(
        await screen.findByRole("toolbar", { name: "Karuna" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Admin" })).toBeInTheDocument();
    expect(
        screen.getByRole("button", { name: /More permissions/ }),
    ).toHaveTextContent("`");
    expect(rows[0]).toHaveAttribute("data-state", "selected");

    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    expect(
        await screen.findByRole("toolbar", { name: "Second Member" }),
    ).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute("tabindex", "0");
    expect(rows[0]).toHaveAttribute("tabindex", "-1");

    // The restricted account has no member view and says so.
    fireEvent.keyDown(rows[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[2]);
    expect(await screen.findByText(/no member view/)).toBeInTheDocument();
});

test("clicking the advanced button with the mouse opens the panel and keeps it open (not just the ⌥⌘P shortcut)", async () => {
    // Regression coverage for the mouse-click path the ⌥⌘P shortcut test
    // below never exercises. The actual bug this guards (Al, 2026-09-14:
    // "the Permissions button isn't responding to clicks", against the
    // control this one replaced) was a timing issue — clicking it swapped
    // the toolbar's children for the panel's synchronously, and a
    // bubble-phase "click outside closes the magnet" document listener then
    // saw the clicked control already detached from the tree, read that as
    // "click landed outside", and undid the open it just caused. jsdom's
    // real-browser click dispatch does not replicate that exact
    // synchronous-commit-during-bubble timing (verified: the listener still
    // sees the target attached), so this test cannot fail against the
    // pre-fix bubble-phase listener on its own — the fix (capture-phase
    // registration, matching every other "click outside" listener in this
    // fork) was verified directly in Chrome on the rig. This test still
    // guards the mouse-click path itself, now via the "…" advanced button.
    renderHub();
    const rows = await settledRows();
    act(() => rows[1].focus());
    await screen.findByRole("toolbar", { name: "Second Member" });

    fireEvent.click(screen.getByRole("button", { name: /More permissions/ }));

    const panel = await screen.findByRole("group", {
        name: "Permissions · Second Member",
    });
    expect(panel).toBeInTheDocument();
    // Give any wrongly-scheduled reset a chance to land before asserting it
    // stayed open — the bug closed the magnet entirely, not just the panel.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
        screen.getByRole("group", { name: "Permissions · Second Member" }),
    ).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute("data-state", "selected");
});

test("the backtick key opens the advanced panel too, and does nothing while typing", async () => {
    renderHub();
    const rows = await settledRows();
    act(() => rows[1].focus());
    await screen.findByRole("toolbar", { name: "Second Member" });

    fireEvent.keyDown(window, { key: "`" });
    expect(
        await screen.findByRole("group", {
            name: "Permissions · Second Member",
        }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "`" });
    await screen.findByRole("toolbar", { name: "Second Member" });
    expect(screen.queryByRole("group", { name: /Permissions ·/ })).toBeNull();

    // Typing a literal backtick into a text field must not open it (the
    // real search box is mocked away in this suite via FilterContainer, so
    // a bare input stands in for "somewhere the guard has to hold").
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "`" });
    expect(screen.queryByRole("group", { name: /Permissions ·/ })).toBeNull();
    input.remove();
});

test("⌥⌘P opens the panel for the selected account, Escape ladders out, a save updates the row", async () => {
    renderHub();
    const rows = await settledRows();
    act(() => rows[1].focus());
    await screen.findByRole("toolbar", { name: "Second Member" });

    fireEvent.keyDown(window, {
        code: "KeyP",
        key: "p",
        metaKey: true,
        altKey: true,
    });
    const panel = await screen.findByRole("group", {
        name: "Permissions · Second Member",
    });
    expect(panel).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);

    mockExec.mockResolvedValueOnce({
        user: { permissions: ["course:enroll", "media:manage", "site:manage"] },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Manage pages" }));
    await waitFor(() =>
        expect(rows[1]).toHaveTextContent("May manage: Manage pages"),
    );
    expect(mockSetPayload.mock.calls.at(-1)[0].variables).toEqual({
        id: "u2",
        permissions: ["course:enroll", "media:manage", "site:manage"],
    });
    expect(screen.getByRole("status")).toHaveTextContent("Manage pages: on");

    fireEvent.keyDown(window, { key: "Escape" });
    await screen.findByRole("toolbar", { name: "Second Member" });
    expect(screen.queryByRole("group", { name: /Permissions ·/ })).toBeNull();
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
    expect(rows[1]).not.toHaveAttribute("data-state", "selected");
});

test("a click on the row selects it, a click on its name link is left to the member view, an outside click puts the magnet away", async () => {
    renderHub();
    const rows = await settledRows();
    fireEvent.click(rows[1].querySelector("td")!);
    expect(
        await screen.findByRole("toolbar", { name: "Second Member" }),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Karuna" });
    expect(link).toHaveAttribute(
        "href",
        expect.stringContaining("/dashboard/users/u1?returnTo="),
    );

    fireEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
});

test("Users displays only the authorized private photo route, never the old avatar URL", async () => {
    mockExec.mockResolvedValue({
        users: users.map((user, index) => ({
            ...user,
            avatar: { file: "https://cdn.example/public-old-avatar.jpg" },
            ...(index === 1 ? { privatePhotoVersion: 7 } : {}),
        })),
        count: users.length,
    });
    renderHub();
    await settledRows();
    const photo = screen.getByRole("img", { name: "Private member photo" });
    expect(photo).toHaveAttribute(
        "src",
        "/api/contact-preferences/photo?userId=u2&v=7",
    );
    expect(document.querySelector('[src*="public-old-avatar"]')).toBeNull();
    expect(String(mockSetPayload.mock.calls[0][0].query)).toContain(
        "privatePhotoVersion",
    );
});
