import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PermissionsMagnet from "../permissions-magnet";
import { responses } from "@config/strings";

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

test("the closed magnet names both actions with their chords", async () => {
    const { onOpenPanel } = renderMagnet();
    const open = await screen.findByRole("button", {
        name: /Permissions/,
    });
    expect(open).toHaveTextContent("⌥⌘P");
    expect(open).toHaveAttribute("aria-keyshortcuts", "Alt+Meta+P");
    const mimic = screen.getByRole("link", { name: /View as member/ });
    expect(mimic).toHaveTextContent("↩");
    expect(mimic).toHaveAttribute(
        "href",
        "/dashboard/users/u2?returnTo=%2Fdashboard%2Fusers",
    );
    fireEvent.click(open);
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
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
