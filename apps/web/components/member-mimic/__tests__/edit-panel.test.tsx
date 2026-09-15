import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { usePathname } from "next/navigation";
import type {
    MemberEdit,
    MemberEditChange,
    MemberEditSnapshot,
    MemberMimicView,
} from "@courselit/common-models";
import { memberEditUi as copy, memberMimicUi } from "@/config/strings";
import MemberMimicProvider from "../provider";
import {
    emailAction,
    fetchHistory,
    fetchPendingRefund,
    loadSnapshot,
    submitEdit,
} from "../edit/api";
import { withValues } from "../edit/use-member-edit";

jest.mock("next/navigation", () => ({ usePathname: jest.fn() }));
jest.mock("../edit/api", () => ({
    loadSnapshot: jest.fn(),
    submitEdit: jest.fn(),
    emailAction: jest.fn(),
    fetchHistory: jest.fn(),
    fetchPendingRefund: jest.fn(),
}));
jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, ...props }) => <div {...props}>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
    DialogDescription: ({ children }) => <p>{children}</p>,
}));

const originalLocation = Object.getOwnPropertyDescriptor(window, "location")!;
const originalFetch = global.fetch;
const mockFetch = jest.fn();
const mockReplace = jest.fn();
const mockReload = jest.fn();

const active: MemberMimicView = {
    kind: "active",
    actor: {
        userId: "admin",
        name: "Administrator",
        email: "admin@example.com",
    },
    subject: { userId: "member", name: "Member", email: "member@example.com" },
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    returnTo: "/dashboard/users?page=2",
};
const baseSnapshot: MemberEditSnapshot = {
    subject: { userId: "member", name: "Member", email: "member@example.com" },
    contact: {
        kind: "email",
        value: "member@example.com",
        checkIns: "none",
        revision: 1,
    },
    actor: { userId: "admin", name: "Administrator", canReviewRefunds: true },
};
let snapshot: MemberEditSnapshot;
let editCount = 0;

const change = (
    field: MemberEditChange["field"],
    before: string,
    after: string,
): MemberEditChange => ({ field, before, after });
/** The server's applied answer: the row plus the record as it now reads. */
function applied(changes: MemberEditChange[], undoOf?: string) {
    editCount += 1;
    const edit: MemberEdit = {
        editId: `edit-${editCount}`,
        subjectUserId: "member",
        editorUserId: "admin",
        mimicId: "mimic-1",
        at: "2026-09-14T18:00:00.000Z",
        changes,
        ...(undoOf ? { undoOf } : {}),
    };
    snapshot = withValues(
        snapshot,
        changes.map((item) => ({ field: item.field, value: item.after })),
    );
    return { kind: "applied" as const, edit, snapshot };
}

const panel = () =>
    document.querySelector("[data-kk-member-edit]") as HTMLElement;
const field = (name: string) =>
    document.querySelector(
        `[data-kk-member-edit-field="${name}"]`,
    ) as HTMLInputElement;
const saveButton = (row: string) =>
    document.querySelector(
        `[data-kk-member-edit-save="${row}"]`,
    ) as HTMLButtonElement;
const statusAt = (row: string) =>
    document.querySelector(`[data-kk-member-edit-status="${row}"]`);
const key = (init: KeyboardEventInit) => fireEvent.keyDown(window, init);
const chordE = () =>
    key({ key: "e", code: "KeyE", metaKey: true, altKey: true });
const undoKey = () => key({ key: "z", code: "KeyZ", metaKey: true });
const redoKey = () =>
    key({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true });

function mount() {
    return render(
        <MemberMimicProvider initialView={active}>
            <p>Published member lesson</p>
        </MemberMimicProvider>,
    );
}

async function openPanel() {
    mount();
    await screen.findByText("Published member lesson");
    fireEvent.click(screen.getByRole("button", { name: /Edit member/ }));
    await waitFor(() => expect(field("name")).toBeTruthy());
    expect(panel()).not.toHaveAttribute("hidden");
}

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as typeof ResizeObserver;
});
beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(submitEdit).mockReset();
    jest.mocked(emailAction).mockReset();
    editCount = 0;
    snapshot = JSON.parse(JSON.stringify(baseSnapshot));
    global.fetch = mockFetch;
    mockFetch.mockImplementation(async (_url: string, init?: RequestInit) =>
        init?.method === "DELETE"
            ? {
                  ok: true,
                  json: async () => ({ redirectTo: "/dashboard/users" }),
              }
            : { ok: true, json: async () => ({ mimic: active }) },
    );
    jest.mocked(usePathname).mockReturnValue("/dashboard/profile");
    Object.defineProperty(window, "location", {
        configurable: true,
        value: {
            href: "http://localhost/dashboard/profile",
            origin: "http://localhost",
            replace: mockReplace,
            reload: mockReload,
        },
    });
    jest.mocked(loadSnapshot).mockImplementation(async () => snapshot);
    jest.mocked(fetchPendingRefund).mockResolvedValue(false);
    jest.mocked(fetchHistory).mockResolvedValue({
        edits: [],
        nextCursor: null,
    });
});

afterEach(() => {
    cleanup();
    jest.useRealTimers();
    Object.defineProperty(window, "location", originalLocation);
    global.fetch = originalFetch;
});

test("the banner names the panel and its chord; ⌥⌘E opens it with the keyboard on the first field, and closes it again", async () => {
    mount();
    await screen.findByText("Published member lesson");
    expect(screen.getByText(memberMimicUi.readOnly)).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Edit member/ });
    expect(toggle).toHaveTextContent("⌥⌘E");
    expect(toggle).toHaveAttribute("aria-keyshortcuts", "Alt+Meta+E");
    expect(panel()).toHaveAttribute("hidden");
    expect(loadSnapshot).not.toHaveBeenCalled();

    chordE();
    expect(panel()).not.toHaveAttribute("hidden");
    expect(screen.getByRole("region", { name: copy.title })).toHaveTextContent(
        "Member",
    );
    await waitFor(() => expect(field("name")).toHaveFocus());
    expect(field("name")).toHaveValue("Member");
    expect(field("email")).toHaveValue("member@example.com");
    expect(screen.getByText(copy.emailHelp)).toBeInTheDocument();
    for (const done of screen.getAllByRole("button", { name: /Done/ }))
        expect(done).toHaveTextContent("⎋");

    chordE();
    expect(panel()).toHaveAttribute("hidden");
    expect(toggle).toHaveFocus();
    expect(mockReload).not.toHaveBeenCalled();
});

test("Enter saves the name with the record's value as before, shows Saved · Undo ⌘Z; ⌘Z reverses it naming the edit, ⇧⌘Z re-applies; Done then reloads the page", async () => {
    await openPanel();
    const first = applied([change("name", "Member", "Member Two")]);
    jest.mocked(submitEdit).mockResolvedValueOnce(first);
    fireEvent.change(field("name"), { target: { value: " Member Two " } });
    expect(screen.getByText("Not saved yet: Name")).toBeInTheDocument();
    fireEvent.keyDown(field("name"), { key: "Enter" });
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    expect(submitEdit).toHaveBeenCalledWith({
        changes: [change("name", "Member", "Member Two")],
    });
    await waitFor(() =>
        expect(statusAt("name")).toHaveTextContent(/^Saved · Undo ⌘Z$/),
    );
    expect(field("name")).toHaveValue("Member Two");
    expect(screen.queryByText(/Not saved yet/)).toBeNull();
    // The banner re-reads its subject after every applied edit.
    expect(mockFetch).toHaveBeenLastCalledWith("/api/member-mimic", {
        cache: "no-store",
        credentials: "same-origin",
    });

    const reversal = applied(
        [change("name", "Member Two", "Member")],
        first.edit.editId,
    );
    jest.mocked(submitEdit).mockResolvedValueOnce(reversal);
    undoKey();
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(2));
    expect(jest.mocked(submitEdit).mock.calls[1][0]).toEqual({
        changes: [change("name", "Member Two", "Member")],
        undoOf: first.edit.editId,
    });
    await waitFor(() => expect(field("name")).toHaveValue("Member"));
    expect(statusAt("name")).toHaveTextContent(/^Undone · Redo ⇧⌘Z$/);

    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied([change("name", "Member", "Member Two")], reversal.edit.editId),
    );
    redoKey();
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(3));
    expect(jest.mocked(submitEdit).mock.calls[2][0]).toEqual({
        changes: [change("name", "Member", "Member Two")],
        undoOf: reversal.edit.editId,
    });
    await waitFor(() => expect(field("name")).toHaveValue("Member Two"));
    expect(statusAt("name")).toHaveTextContent(/^Redone · Undo ⌘Z$/);

    jest.useFakeTimers();
    fireEvent.click(screen.getAllByRole("button", { name: /Done/ })[0]);
    expect(panel()).toHaveAttribute("hidden");
    act(() => {
        jest.advanceTimersByTime(1);
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
});

test("a stale answer resyncs the field to the record and keeps its notice until dismissed", async () => {
    await openPanel();
    jest.mocked(submitEdit).mockResolvedValueOnce({
        kind: "stale",
        current: [{ field: "name", value: "Renamed elsewhere" }],
        message: copy.stale,
    });
    fireEvent.change(field("name"), { target: { value: "My name" } });
    fireEvent.click(saveButton("name"));
    await waitFor(() => expect(field("name")).toHaveValue("Renamed elsewhere"));
    jest.useFakeTimers();
    act(() => {
        jest.advanceTimersByTime(10_000);
    });
    expect(screen.getByText(copy.stale)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.dismiss }));
    expect(screen.queryByText(copy.stale)).toBeNull();
    expect(mockReload).not.toHaveBeenCalled();
});

test("contact kind and value save as one compound edit; an unchanged row sends nothing", async () => {
    await openPanel();
    fireEvent.click(saveButton("contact"));
    await act(async () => {});
    expect(submitEdit).not.toHaveBeenCalled();
    expect(screen.getByText(copy.unchanged)).toBeInTheDocument();

    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied([
            change("contact.kind", "email", "voice"),
            change("contact.value", "member@example.com", "+1 555 0100"),
        ]),
    );
    fireEvent.change(field("contact.kind"), { target: { value: "voice" } });
    expect(screen.getByText(copy.contactPhone)).toBeInTheDocument();
    fireEvent.change(field("contact.value"), {
        target: { value: "+1 555 0100" },
    });
    fireEvent.keyDown(field("contact.value"), { key: "Enter" });
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    expect(submitEdit).toHaveBeenCalledWith({
        changes: [
            change("contact.kind", "email", "voice"),
            change("contact.value", "member@example.com", "+1 555 0100"),
        ],
    });
    await waitFor(() =>
        expect(statusAt("contact")).toHaveTextContent(/Saved · Undo ⌘Z/),
    );
});

test("a never-held email asks for the code the new address received: a wrong code counts tries, the right one lands and tells the banner", async () => {
    await openPanel();
    jest.mocked(submitEdit).mockResolvedValueOnce({
        kind: "verify",
        pending: {
            pendingId: "pending-1",
            email: "new@example.com",
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
        snapshot,
    });
    fireEvent.change(field("email"), { target: { value: "New@Example.com" } });
    fireEvent.click(saveButton("email"));
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    expect(submitEdit).toHaveBeenCalledWith({
        changes: [change("email", "member@example.com", "new@example.com")],
    });
    expect(
        await screen.findByText(
            "A code was sent to new@example.com. Ask the member for it.",
        ),
    ).toBeInTheDocument();
    const code = screen.getByLabelText(copy.codeLabel) as HTMLInputElement;
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(field("email")).toBeDisabled();

    jest.mocked(emailAction).mockResolvedValueOnce({
        kind: "wrong-code",
        attemptsLeft: 4,
    });
    fireEvent.change(code, { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(emailAction).toHaveBeenCalledTimes(1));
    expect(emailAction).toHaveBeenCalledWith({
        action: "confirm",
        pendingId: "pending-1",
        code: "111111",
    });
    expect(
        await screen.findByText("That code is not right. 4 tries left."),
    ).toBeInTheDocument();

    const landed = applied([
        change("email", "member@example.com", "new@example.com"),
    ]);
    jest.mocked(emailAction).mockResolvedValueOnce({
        kind: "applied",
        edit: {
            ...landed.edit,
            emailVerification: { kind: "code-to-new-address" },
        },
        snapshot: landed.snapshot,
    });
    const verifies = mockFetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText(copy.codeLabel), {
        target: { value: "222222" },
    });
    fireEvent.keyDown(screen.getByLabelText(copy.codeLabel), { key: "Enter" });
    await waitFor(() => expect(emailAction).toHaveBeenCalledTimes(2));
    expect(jest.mocked(emailAction).mock.calls[1][0]).toEqual({
        action: "confirm",
        pendingId: "pending-1",
        code: "222222",
    });
    await waitFor(() =>
        expect(statusAt("email")).toHaveTextContent(copy.emailChanged),
    );
    expect(statusAt("email")).toHaveTextContent("Undo ⌘Z");
    expect(field("email")).toHaveValue("new@example.com");
    expect(field("email")).toBeEnabled();
    expect(screen.queryByLabelText(copy.codeLabel)).toBeNull();
    expect(mockFetch.mock.calls.length).toBeGreaterThan(verifies);
});

test("Escape closes the panel; a half-typed value survives reopening, and nothing reloads while it is unsaved", async () => {
    await openPanel();
    fireEvent.change(field("name"), { target: { value: "Half typed" } });
    key({ key: "Escape" });
    expect(panel()).toHaveAttribute("hidden");
    chordE();
    expect(panel()).not.toHaveAttribute("hidden");
    expect(field("name")).toHaveValue("Half typed");
    expect(screen.getByText("Not saved yet: Name")).toBeInTheDocument();
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    // A click outside the panel and the banner closes it too.
    fireEvent.click(screen.getByText("Published member lesson"));
    expect(panel()).toHaveAttribute("hidden");
    expect(mockReload).not.toHaveBeenCalled();
});

test("History shows BEFORE and AFTER per field, one Restore live and one inert with its reason, and a restore composes against the record", async () => {
    await openPanel();
    const older = applied([change("name", "Old name", "Member")]);
    const newer = applied([
        change("contact.kind", "email", "text"),
        change("contact.value", "member@example.com", "+1 555 0100"),
    ]);
    // History is read fresh; the record still says Member / email.
    snapshot = JSON.parse(JSON.stringify(baseSnapshot));
    jest.mocked(fetchHistory).mockResolvedValueOnce({
        edits: [
            { ...newer.edit, undoOf: "edit-0" },
            {
                ...older.edit,
                editor: {
                    userId: "other",
                    name: "Al",
                    email: "al@example.com",
                },
                editorUserId: "other",
            },
        ],
        nextCursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: copy.history }));
    const restore = await screen.findAllByRole("button", {
        name: copy.restoreRed,
    });
    expect(restore).toHaveLength(1);
    expect(
        screen.getByRole("button", { name: copy.alreadyCurrent }),
    ).toBeDisabled();
    expect(screen.getAllByText(copy.before)).toHaveLength(3);
    expect(screen.getAllByText(copy.after)).toHaveLength(3);
    const dialog = within(
        document.querySelector(
            "[data-kk-member-edit-history-dialog]",
        ) as HTMLElement,
    );
    expect(dialog.getByText(copy.reverses)).toBeInTheDocument();
    expect(dialog.getByText("you")).toBeInTheDocument();
    expect(dialog.getByText("Al")).toBeInTheDocument();
    expect(dialog.getByText("Text message")).toBeInTheDocument();
    expect(dialog.getByText("Old name")).toBeInTheDocument();

    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied([change("name", "Member", "Old name")], older.edit.editId),
    );
    fireEvent.click(restore[0]);
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    expect(submitEdit).toHaveBeenCalledWith({
        changes: [change("name", "Member", "Old name")],
        undoOf: older.edit.editId,
    });
    await waitFor(() => expect(field("name")).toHaveValue("Old name"));
    expect(fetchHistory).toHaveBeenCalledTimes(2);
});

test("the admin's own account keeps its sign-in email: the row is off with the reason", async () => {
    snapshot = { ...snapshot, emailLock: "self" };
    await openPanel();
    expect(field("email")).toBeDisabled();
    expect(saveButton("email")).toBeDisabled();
    expect(screen.getByText(copy.emailLockSelf)).toBeInTheDocument();
    expect(field("name")).toBeEnabled();
});

test("History restores the whole recorded contact row when one field already matches", async () => {
    await openPanel();
    const edit: MemberEdit = {
        editId: "contact-pair",
        subjectUserId: "member",
        editorUserId: "admin",
        mimicId: "mimic-1",
        at: "2026-09-14T18:00:00.000Z",
        changes: [
            change("contact.kind", "email", "voice"),
            change("contact.value", "old@example.com", "+1 555 0100"),
        ],
    };
    jest.mocked(fetchHistory).mockResolvedValueOnce({
        edits: [edit],
        nextCursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: copy.history }));
    const restore = await screen.findByRole("button", {
        name: copy.restoreRed,
    });
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied(
            [
                change("contact.kind", "email", "email"),
                change(
                    "contact.value",
                    "member@example.com",
                    "old@example.com",
                ),
            ],
            edit.editId,
        ),
    );
    fireEvent.click(restore);
    await waitFor(() =>
        expect(submitEdit).toHaveBeenCalledWith({
            changes: [
                change("contact.kind", "email", "email"),
                change(
                    "contact.value",
                    "member@example.com",
                    "old@example.com",
                ),
            ],
            undoOf: edit.editId,
        }),
    );
});

test("a waiting refund request is named, and Review refunds leaves Mimic for Refund review", async () => {
    jest.mocked(fetchPendingRefund).mockResolvedValue(true);
    await openPanel();
    expect(await screen.findByText(copy.pendingRefund)).toBeInTheDocument();
    const review = screen.getByRole("button", { name: /Review refunds/ });
    expect(review).toHaveAttribute("title", copy.reviewRefundsHelp);
    fireEvent.click(review);
    await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/dashboard/refund-review"),
    );
    expect(mockFetch).toHaveBeenCalledWith("/api/member-mimic", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
    });
    expect(mockReload).not.toHaveBeenCalled();
});

test("an admin without settings permission gets no Review refunds button", async () => {
    snapshot = {
        ...snapshot,
        actor: { ...snapshot.actor, canReviewRefunds: false },
    };
    await openPanel();
    expect(screen.queryByRole("button", { name: /Review refunds/ })).toBeNull();
});

test("an unfinished email notice is visible and can be retried", async () => {
    snapshot = { ...snapshot, emailEffects: "pending" };
    await openPanel();
    expect(
        await screen.findByText(copy.emailEffectsPending),
    ).toBeInTheDocument();
    const finished = { ...snapshot };
    delete finished.emailEffects;
    jest.mocked(loadSnapshot).mockResolvedValueOnce(finished);
    fireEvent.click(
        screen.getByRole("button", { name: copy.retryEmailEffects }),
    );
    await waitFor(() =>
        expect(screen.queryByText(copy.emailEffectsPending)).toBeNull(),
    );
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
});

test("older History rows can be retried after a failed page load without losing loaded rows", async () => {
    await openPanel();
    const first = applied([change("name", "Earlier", "Member")]);
    jest.mocked(fetchHistory).mockResolvedValueOnce({
        edits: [first.edit],
        nextCursor: "older",
    });
    fireEvent.click(screen.getByRole("button", { name: copy.history }));
    await screen.findByText("Earlier");
    jest.mocked(fetchHistory).mockRejectedValueOnce(
        new Error("History connection lost"),
    );
    fireEvent.click(screen.getByRole("button", { name: copy.historyMore }));
    expect(
        await screen.findByText("History connection lost"),
    ).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
    jest.mocked(fetchHistory).mockResolvedValueOnce({
        edits: [],
        nextCursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: copy.historyMore }));
    await waitFor(() =>
        expect(screen.queryByText("History connection lost")).toBeNull(),
    );
    expect(fetchHistory).toHaveBeenLastCalledWith("older");
});

test("a failed undo remains available for retry; holding the chord does not undo another edit", async () => {
    await openPanel();
    const first = applied([change("name", "Member", "Updated")]);
    jest.mocked(submitEdit).mockResolvedValueOnce(first);
    fireEvent.change(field("name"), { target: { value: "Updated" } });
    fireEvent.click(saveButton("name"));
    await waitFor(() => expect(statusAt("name")).toHaveTextContent(copy.saved));
    jest.mocked(submitEdit).mockRejectedValueOnce(new Error("Connection lost"));
    undoKey();
    await screen.findByText("Connection lost");
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied([change("name", "Updated", "Member")], first.edit.editId),
    );
    undoKey();
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(field("name")).toHaveValue("Member"));
    key({
        key: "z",
        code: "KeyZ",
        metaKey: true,
        shiftKey: true,
        repeat: true,
    });
    expect(submitEdit).toHaveBeenCalledTimes(3);
});

test("typing while a save is in flight preserves the newer draft", async () => {
    await openPanel();
    let finish: (value: ReturnType<typeof applied>) => void;
    jest.mocked(submitEdit).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    fireEvent.change(field("name"), { target: { value: "First draft" } });
    fireEvent.click(saveButton("name"));
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    fireEvent.change(field("name"), { target: { value: "Still typing" } });
    await act(async () => {
        finish(applied([change("name", "Member", "First draft")]));
    });
    expect(field("name")).toHaveValue("Still typing");
    expect(screen.getByText("Not saved yet: Name")).toBeInTheDocument();
});

test("a save that finishes after closing refreshes the member page", async () => {
    await openPanel();
    let finish!: (value: ReturnType<typeof applied>) => void;
    jest.mocked(submitEdit).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    fireEvent.change(field("name"), { target: { value: "Updated" } });
    fireEvent.click(saveButton("name"));
    await waitFor(() => expect(submitEdit).toHaveBeenCalledTimes(1));
    key({ key: "Escape" });
    expect(panel()).toHaveAttribute("hidden");
    expect(mockReload).not.toHaveBeenCalled();
    await act(async () => {
        finish(applied([change("name", "Member", "Updated")]));
    });
    await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
});

test("a saved change still refreshes after reopening and discarding a newer draft", async () => {
    await openPanel();
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied([change("name", "Member", "Updated")]),
    );
    fireEvent.change(field("name"), { target: { value: "Updated" } });
    fireEvent.click(saveButton("name"));
    await waitFor(() => expect(statusAt("name")).toHaveTextContent(copy.saved));
    fireEvent.change(field("name"), { target: { value: "Another draft" } });
    key({ key: "Escape" });
    expect(mockReload).not.toHaveBeenCalled();
    chordE();
    fireEvent.change(field("name"), { target: { value: "Updated" } });
    key({ key: "Escape" });
    await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
});

test("saving another row keeps the pending sign-in email confirmation visible", async () => {
    const pending = {
        pendingId: "pending-1",
        email: "new@example.com",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
    };
    snapshot = { ...snapshot, pendingEmail: pending };
    await openPanel();
    expect(await screen.findByLabelText(copy.codeLabel)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(copy.codeLabel), {
        target: { value: "123" },
    });
    jest.mocked(submitEdit).mockResolvedValueOnce(
        applied([change("name", "Member", "Updated")]),
    );
    fireEvent.change(field("name"), { target: { value: "Updated" } });
    fireEvent.click(saveButton("name"));
    await waitFor(() => expect(statusAt("name")).toHaveTextContent(copy.saved));
    expect(screen.getByLabelText(copy.codeLabel)).toHaveValue("123");
    expect(field("email")).toBeDisabled();
});
