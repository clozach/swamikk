import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import AccountClosure from "..";
import { authClient } from "@/lib/auth-client";
let mimic = { kind: "inactive" };
jest.mock("@/components/member-mimic/context", () => ({
    useMemberMimic: () => mimic,
}));
jest.mock("@/lib/auth-client", () => ({ authClient: { signOut: jest.fn() } }));
const fetchMock = jest.fn();
const originalFetch = global.fetch;
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const review = {
    kind: "review",
    blockers: [],
    recentIdentity: true,
    pendingWrites: 0,
    state: "active",
    reviewHash: "a".repeat(64),
};
beforeEach(() => {
    mimic = { kind: "inactive" };
    fetchMock.mockReset();
    global.fetch = fetchMock;
    jest.mocked(authClient.signOut).mockReset().mockResolvedValue({});
});
afterEach(cleanup);
afterAll(() => {
    global.fetch = originalFetch;
});
async function open(value = review) {
    fetchMock.mockResolvedValueOnce(response(value));
    render(<AccountClosure userId="member" />);
    fireEvent.click(
        screen.getByRole("button", { name: "Review account closure" }),
    );
    await screen.findByText(/database backups/);
}
it("requires consequence review and typed confirmation before any deletion request", async () => {
    await open();
    const close = screen.getByRole("button", {
        name: "Permanently close my account",
    });
    expect(close).toBeDisabled();
    expect(
        screen.getByText(/Receipts, submitted refund requests/),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "CLOSE" },
    });
    expect(close).not.toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("keeps the account masked as closed when sign-out fails after successful erasure", async () => {
    await open();
    fetchMock.mockResolvedValueOnce(response({ kind: "closed" }));
    jest.mocked(authClient.signOut).mockRejectedValueOnce(new Error("network"));
    sessionStorage.setItem("kk-comment:member:page", "private");
    sessionStorage.setItem("kk-comment:other:page", "other person's draft");
    sessionStorage.setItem("page-edit:member:page", "private proposal");
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "CLOSE" },
    });
    fireEvent.click(
        screen.getByRole("button", { name: "Permanently close my account" }),
    );
    await screen.findByText(/Your account is closed/);
    expect(sessionStorage.getItem("kk-comment:member:page")).toBeNull();
    expect(sessionStorage.getItem("page-edit:member:page")).toBeNull();
    expect(sessionStorage.getItem("kk-comment:other:page")).not.toBeNull();
    expect(
        screen.queryByRole("button", { name: "Review account closure" }),
    ).toBeNull();
});
it("requires a new real sign-in when the saved session is no longer recent", async () => {
    await open({ ...review, recentIdentity: false });
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy();
    expect(
        screen.queryByRole("button", { name: "Permanently close my account" }),
    ).toBeNull();
});
it("shows a recoverable error if starting a fresh sign-in fails", async () => {
    await open({ ...review, recentIdentity: false });
    jest.mocked(authClient.signOut).mockRejectedValueOnce(
        new Error("Sign-out unavailable"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    await screen.findByRole("alert");
    expect(screen.getByText(/Sign-out unavailable/)).toBeTruthy();
    expect(
        screen.queryByRole("button", { name: "Permanently close my account" }),
    ).toBeNull();
});
it("keeps membership help available and prevents confirmation while a subscription remains", async () => {
    await open({
        ...review,
        blockers: [
            {
                kind: "membership",
                message: "Review your subscription",
                href: "/dashboard/membership",
            },
        ],
    } as any);
    expect(
        screen
            .getByRole("link", { name: "Review with help" })
            .getAttribute("href"),
    ).toBe("/dashboard/membership");
    expect(
        screen.queryByRole("button", { name: "Permanently close my account" }),
    ).toBeNull();
});
it("offers no closure controls or private API reads in Mimic", () => {
    mimic = { kind: "active" };
    render(<AccountClosure userId="member" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
});
it("reopens the server gate when keeping an account after a pending closure", async () => {
    await open();
    fetchMock.mockResolvedValueOnce(response({ kind: "kept" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep my account" }));
    await waitFor(() =>
        expect(
            screen.getByRole("button", { name: "Review account closure" }),
        ).toBeTruthy(),
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
        method: "PATCH",
        body: JSON.stringify({ action: "keep" }),
    });
});
