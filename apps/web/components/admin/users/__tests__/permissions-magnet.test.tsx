import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PermissionsMagnet from "../permissions-magnet";
import { responses } from "@config/strings";
import { ADMIN_PERMISSIONS } from "@ui-config/constants";

const mockExec = jest.fn();
const mockSetPayload = jest.fn();
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

const address = { backend: "http://example.test", frontend: "" };
const member = {
    userId: "u2",
    email: "second.member@example.com",
    name: "Second Member",
    active: true,
    permissions: ["course:enroll"],
} as any;
const sentPermissions = () =>
    mockSetPayload.mock.calls.map((call) => call[0].variables.permissions);

function renderMagnet(
    props: Partial<React.ComponentProps<typeof PermissionsMagnet>> = {},
) {
    const row = document.createElement("tr");
    document.body.appendChild(row);
    const onOpenPanel = jest.fn();
    const onClosePanel = jest.fn();
    const onSaved = jest.fn();
    const utils = render(
        <PermissionsMagnet
            user={member}
            rowElement={row}
            panel={false}
            address={address}
            selfUserId="me"
            mimicHref="/dashboard/users/u2?returnTo=%2Fdashboard%2Fusers"
            onOpenPanel={onOpenPanel}
            onClosePanel={onClosePanel}
            onSaved={onSaved}
            {...props}
        />,
    );
    return { ...utils, row, onOpenPanel, onClosePanel, onSaved };
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
    document.body.innerHTML = "";
});

test("the closed magnet is a single Admin checkbox plus a way into the advanced view, not a Permissions button", async () => {
    const { onOpenPanel } = renderMagnet();
    // The old "Permissions" button is gone outright — Al, 2026-09-14: "far
    // too complex for KK."
    expect(screen.queryByRole("button", { name: /^Permissions/ })).toBeNull();

    const admin = await screen.findByRole("checkbox", { name: "Admin" });
    expect(admin).not.toBeChecked(); // member.permissions holds none of ADMIN_PERMISSIONS

    const advanced = screen.getByRole("button", { name: /More permissions/ });
    expect(advanced).toHaveTextContent("`");
    expect(advanced).toHaveAttribute("aria-keyshortcuts", "Alt+Meta+P `");
    fireEvent.click(advanced);
    expect(onOpenPanel).toHaveBeenCalledTimes(1);

    const mimic = screen.getByRole("link", { name: /View as member/ });
    expect(mimic).toHaveTextContent("↩");
    expect(mimic).toHaveAttribute(
        "href",
        "/dashboard/users/u2?returnTo=%2Fdashboard%2Fusers",
    );
});

test("the Admin checkbox reads checked, unchecked or indeterminate from what the account actually holds", async () => {
    const { unmount } = renderMagnet({
        user: { ...member, permissions: ["course:enroll"] },
    });
    expect(
        await screen.findByRole("checkbox", { name: "Admin" }),
    ).not.toBeChecked();
    unmount();

    const { unmount: unmountChecked } = renderMagnet({
        user: { ...member, permissions: [...ADMIN_PERMISSIONS] },
    });
    expect(
        await screen.findByRole("checkbox", { name: "Admin" }),
    ).toBeChecked();
    unmountChecked();

    // Some but not all six is real — the advanced panel can produce it one
    // box at a time — and gets an honest tri-state box, not a coerced one.
    renderMagnet({
        user: { ...member, permissions: [ADMIN_PERMISSIONS[0]] },
    });
    const partial = await screen.findByRole("checkbox", { name: "Admin" });
    expect(partial).not.toBeChecked();
    expect(partial.getAttribute("data-state")).toBe("indeterminate");
});

test("checking Admin grants the whole bundle; unchecking removes it — the non-admin baseline is untouched either way", async () => {
    mockExec.mockResolvedValueOnce({
        user: { permissions: ["course:enroll", ...ADMIN_PERMISSIONS] },
    });
    const { onSaved } = renderMagnet({
        user: { ...member, permissions: ["course:enroll"] },
    });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Admin" }));
    await waitFor(() =>
        expect(onSaved).toHaveBeenCalledWith([
            "course:enroll",
            ...ADMIN_PERMISSIONS,
        ]),
    );
    expect(sentPermissions()[0]).toEqual(
        expect.arrayContaining(["course:enroll", ...ADMIN_PERMISSIONS]),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Admin: on");
    expect(screen.getByRole("checkbox", { name: "Admin" })).toBeChecked();

    mockExec.mockResolvedValueOnce({
        user: { permissions: ["course:enroll"] },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Admin" }));
    await waitFor(() =>
        expect(onSaved).toHaveBeenLastCalledWith(["course:enroll"]),
    );
    expect(sentPermissions()[1]).toEqual(["course:enroll"]);
    expect(screen.getByRole("status")).toHaveTextContent("Admin: off");
    expect(screen.getByRole("checkbox", { name: "Admin" })).not.toBeChecked();
});

test("clicking an indeterminate Admin checkbox still reads 'Admin: on', not a generic permission count", async () => {
    // Two of the six admin permissions already granted — reachable one box
    // at a time from the advanced panel — renders indeterminate; Radix maps
    // a click from there to checked=true, which fills in the missing four.
    const startingAdmin = ADMIN_PERMISSIONS.slice(0, 2);
    mockExec.mockResolvedValueOnce({
        user: { permissions: ["course:enroll", ...ADMIN_PERMISSIONS] },
    });
    renderMagnet({
        user: { ...member, permissions: ["course:enroll", ...startingAdmin] },
    });
    const admin = await screen.findByRole("checkbox", { name: "Admin" });
    expect(admin.getAttribute("data-state")).toBe("indeterminate");
    fireEvent.click(admin);
    await waitFor(() => expect(admin).toBeChecked());
    expect(screen.getByRole("status")).toHaveTextContent("Admin: on");
});

test("Undo reverses the Admin toggle without ever opening the advanced panel", async () => {
    mockExec
        .mockResolvedValueOnce({
            user: { permissions: ["course:enroll", ...ADMIN_PERMISSIONS] },
        })
        .mockResolvedValueOnce({ user: { permissions: ["course:enroll"] } });
    const { onSaved } = renderMagnet({
        user: { ...member, permissions: ["course:enroll"] },
    });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Admin" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    // The way back has to work here, at the pill — not only after opening
    // the advanced panel (that gate was the whole point of this fix).
    fireEvent.keyDown(window, { code: "KeyZ", key: "z", metaKey: true });
    await waitFor(() =>
        expect(onSaved).toHaveBeenLastCalledWith(["course:enroll"]),
    );
    expect(screen.getByRole("checkbox", { name: "Admin" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /Redo/ })).toBeInTheDocument();
});

test("your own account: the Admin checkbox is disabled with the reason on the pill, and the advanced view stays reachable", async () => {
    renderMagnet({ selfUserId: "u2" });
    const admin = await screen.findByRole("checkbox", { name: "Admin" });
    expect(admin).toBeDisabled();
    expect(admin.closest(".kk-permissions-admin")).toHaveAttribute(
        "title",
        expect.stringContaining("another admin"),
    );
    expect(
        screen.getByRole("button", { name: /More permissions/ }),
    ).toBeEnabled();
});

test("a refusal from the checkbox marks the account protected, on the closed pill too — with a visible, describable reason and focus handed onward", async () => {
    mockExec.mockRejectedValueOnce(new Error(responses.action_not_allowed));
    const { onSaved } = renderMagnet();
    const admin = await screen.findByRole("checkbox", { name: "Admin" });
    admin.focus();
    fireEvent.click(admin);
    // The checkbox disables the instant the click fires (mid-save), before
    // the refusal even settles — that's not proof the refusal landed. Wait
    // for the describedby wiring instead, which only appears once the
    // account is actually marked protected.
    await waitFor(() =>
        expect(screen.getByRole("checkbox", { name: "Admin" })).toHaveAttribute(
            "aria-describedby",
        ),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Admin" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Admin" })).toBeDisabled();
    // Not just a mouse-hover tooltip: a real, visible, describable note —
    // the checkbox can never re-enable for this account, so the reason has
    // to be readable by keyboard and screen-reader users too.
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/site owner/);
    expect(screen.getByRole("checkbox", { name: "Admin" })).toHaveAttribute(
        "aria-describedby",
        note.id,
    );
    // The checkbox is gone from the tab order for good on this account —
    // focus moves to the next interactive control rather than to <body>.
    await waitFor(() =>
        expect(document.activeElement).toBe(
            screen.getByRole("button", { name: /More permissions/ }),
        ),
    );
});

test("focus returns to the Admin checkbox after a successful toggle, since a disabled control drops out of the tab order mid-save", async () => {
    mockExec.mockResolvedValueOnce({
        user: { permissions: ["course:enroll", ...ADMIN_PERMISSIONS] },
    });
    renderMagnet({ user: { ...member, permissions: ["course:enroll"] } });
    const admin = await screen.findByRole("checkbox", { name: "Admin" });
    admin.focus();
    fireEvent.click(admin);
    expect(admin).toBeDisabled(); // blurred to <body> the instant it disables
    await waitFor(() =>
        expect(screen.getByRole("checkbox", { name: "Admin" })).toBeEnabled(),
    );
    expect(document.activeElement).toBe(
        screen.getByRole("checkbox", { name: "Admin" }),
    );
});

test("⌘Z ignores a second press while the first undo is still saving, so the rendered stacks never desync from the real ones", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mockExec
        .mockResolvedValueOnce({
            user: { permissions: ["course:enroll", ...ADMIN_PERMISSIONS] },
        })
        .mockResolvedValueOnce({ user: { permissions: ["course:enroll"] } })
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve;
                }),
        );
    const { onSaved } = renderMagnet({
        user: { ...member, permissions: ["course:enroll"] },
    });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Admin" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("checkbox", { name: "Admin" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    // Two real changes now sit in the undo stack. Hold ⌘Z — real key-repeat —
    // while the first undo's request is still in flight.
    fireEvent.keyDown(window, { code: "KeyZ", key: "z", metaKey: true });
    fireEvent.keyDown(window, { code: "KeyZ", key: "z", metaKey: true });
    fireEvent.keyDown(window, { code: "KeyZ", key: "z", metaKey: true });
    // The first press's commit() runs synchronously up to its own await, so
    // the send already happened — that's the one legitimate call. The second
    // and third presses land while `saving` is already true, and the guard
    // drops both: no fourth or fifth send, and the popped value is the real
    // one (the state from before the second click), not a desynced stack.
    expect(sentPermissions()).toHaveLength(3);
    expect(sentPermissions()[2]).toEqual([
        "course:enroll",
        ...ADMIN_PERMISSIONS,
    ]);
    resolveFirst({
        user: { permissions: ["course:enroll", ...ADMIN_PERMISSIONS] },
    });
    await waitFor(() =>
        expect(screen.getByRole("checkbox", { name: "Admin" })).toBeChecked(),
    );
    // The stack is exactly as tall as what actually got popped — a further
    // ⌘Z is a real, working undo, not a dead click against a stale count.
    expect(screen.getByRole("button", { name: /Undo/ })).toBeInTheDocument();
});

test("a save that resolves after the account is deselected still updates the row, and hands the outcome to onOutcomeElsewhere since there is no status line left to show it in", async () => {
    let resolveSave: (value: unknown) => void = () => {};
    mockExec.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                resolveSave = resolve;
            }),
    );
    const onOutcomeElsewhere = jest.fn();
    const { onSaved, unmount } = renderMagnet({
        user: { ...member, permissions: ["course:enroll"] },
        onOutcomeElsewhere,
    });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Admin" }));
    unmount(); // a different row was selected before the save came back
    resolveSave({
        user: { permissions: ["course:enroll", ...ADMIN_PERMISSIONS] },
    });
    await waitFor(() =>
        expect(onSaved).toHaveBeenCalledWith([
            "course:enroll",
            ...ADMIN_PERMISSIONS,
        ]),
    );
    expect(onOutcomeElsewhere).toHaveBeenCalledWith(
        expect.stringContaining("Admin: on"),
    );
});

test("a restricted account says it has no member view instead of hiding the fact", async () => {
    renderMagnet({ mimicHref: null });
    expect(screen.queryByRole("link", { name: /View as member/ })).toBeNull();
    expect(await screen.findByText(/no member view/)).toBeInTheDocument();
});

test("the panel saves a box at once, reports it in place, and ⌘Z / ⇧⌘Z reverse it", async () => {
    mockExec
        .mockResolvedValueOnce({
            user: { permissions: ["course:enroll", "user:manage"] },
        })
        .mockResolvedValueOnce({ user: { permissions: ["course:enroll"] } })
        .mockResolvedValueOnce({
            user: { permissions: ["course:enroll", "user:manage"] },
        });
    const { onSaved, rerender } = renderMagnet({ panel: true });
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(9);
    for (const box of boxes) expect(box).toHaveAccessibleName();
    expect(screen.getByRole("button", { name: /Done/ })).toHaveTextContent("⎋");

    fireEvent.click(screen.getByRole("checkbox", { name: "Manage users" }));
    await waitFor(() =>
        expect(onSaved).toHaveBeenCalledWith(["course:enroll", "user:manage"]),
    );
    expect(sentPermissions()).toEqual([["course:enroll", "user:manage"]]);
    // The list row updates from the server's answer; the magnet reads it back.
    rerender(
        <PermissionsMagnet
            user={{ ...member, permissions: ["course:enroll", "user:manage"] }}
            rowElement={document.querySelector("tr")}
            panel
            address={address}
            selfUserId="me"
            mimicHref={null}
            onOpenPanel={jest.fn()}
            onClosePanel={jest.fn()}
            onSaved={onSaved}
        />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Manage users: on");
    const undo = screen.getByRole("button", { name: /Undo/ });
    expect(undo).toHaveTextContent("⌘Z");

    fireEvent.keyDown(window, { code: "KeyZ", key: "z", metaKey: true });
    await waitFor(() =>
        expect(onSaved).toHaveBeenLastCalledWith(["course:enroll"]),
    );
    expect(sentPermissions()[1]).toEqual(["course:enroll"]);
    expect(screen.getByRole("button", { name: /Redo/ })).toHaveTextContent(
        "⇧⌘Z",
    );

    fireEvent.keyDown(window, {
        code: "KeyZ",
        key: "z",
        metaKey: true,
        shiftKey: true,
    });
    await waitFor(() => expect(sentPermissions()).toHaveLength(3));
    expect(sentPermissions()[2]).toEqual(["course:enroll", "user:manage"]);
});

test("your own account is read-only with the reason on the panel", async () => {
    renderMagnet({ panel: true, selfUserId: "u2" });
    expect(await screen.findByRole("note")).toHaveTextContent(/another admin/);
    for (const box of screen.getAllByRole("checkbox"))
        expect(box).toBeDisabled();
});

test("a refusal from the server marks the account protected and keeps the boxes as they were", async () => {
    mockExec.mockRejectedValueOnce(new Error(responses.action_not_allowed));
    const { onSaved } = renderMagnet({ panel: true });
    fireEvent.click(
        await screen.findByRole("checkbox", { name: "Manage pages" }),
    );
    await waitFor(() =>
        expect(screen.getByRole("note")).toHaveTextContent(/site owner/),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(
        screen.getByRole("checkbox", { name: "Manage pages" }),
    ).not.toBeChecked();
    for (const box of screen.getAllByRole("checkbox"))
        expect(box).toBeDisabled();
});

test("any other failure is reported where the click happened and nothing changes", async () => {
    mockExec.mockRejectedValueOnce(new Error("Network down"));
    const { onSaved } = renderMagnet({ panel: true });
    fireEvent.click(
        await screen.findByRole("checkbox", { name: "Manage settings" }),
    );
    await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent("Network down"),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(
        screen.getByRole("checkbox", { name: "Manage settings" }),
    ).not.toBeChecked();
    expect(
        screen.getByRole("checkbox", { name: "Manage settings" }),
    ).toBeEnabled();
});

test("Done hands back to the row", async () => {
    const { onClosePanel } = renderMagnet({ panel: true });
    fireEvent.click(await screen.findByRole("button", { name: /Done/ }));
    expect(onClosePanel).toHaveBeenCalledTimes(1);
});
