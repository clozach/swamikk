import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import type { MemberMimicView } from "@courselit/common-models";
import type {
    BillingCancellationView,
    BillingMembershipView,
    MemberBillingView,
} from "@/services/member-billing/types";
import MemberBilling from "..";
import { CancellationReview } from "../review";
import { RefundStatus } from "../consequences";
import { billingCopy as copy } from "../copy";
import { money } from "../format";

let mockMimic: MemberMimicView = { kind: "inactive" };
jest.mock("@/components/member-mimic/context", () => ({
    useMemberMimic: () => mockMimic,
}));
jest.mock("../closing-gift", () => ({
    ClosingGift: () => <section>{copy.farewellTitle}</section>,
}));
const originalFetch = global.fetch;
const fetchMock = jest.fn();
const response = (value: unknown) => ({ ok: true, json: async () => value });
const consequences = {
    kind: "known" as const,
    retainedCount: 3,
    unknownReleaseCount: 0,
    unknownCourseCount: 0,
    archiveAccess: "ends-on-cancellation" as const,
    futureDrops: "stop-on-cancellation" as const,
    cutoff: null,
};
function operation(
    overrides: Partial<BillingCancellationView> = {},
): BillingCancellationView {
    return {
        operationId: "operation-1",
        phase: "quoted",
        access: "unchanged",
        canConfirm: true,
        canReconcile: false,
        closingGift: null,
        updatedAt: new Date().toISOString(),
        refund: { kind: "not-started" },
        quote: {
            hash: "frozen-hash",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            currency: "nzd",
            mode: "test",
            paidAmount: 1100,
            alreadyRefundedAmount: 300,
            refundAmount: 800,
            payment: "paid",
            period: {
                start: "2026-09-01T00:00:00Z",
                end: "2026-10-01T00:00:00Z",
            },
            consequences,
        },
        ...overrides,
    };
}
function membership(
    overrides: Partial<BillingMembershipView> = {},
): BillingMembershipView {
    return {
        membershipId: "membership-1",
        productName: "Members Library",
        planName: "Monthly membership",
        status: "active",
        planType: "subscription",
        invoices: [
            {
                invoiceId: "invoice-1",
                amount: 11,
                currency: "nzd",
                mode: "test",
                status: "paid",
                paidAt: null,
                receipt: { kind: "unavailable" },
            },
        ],
        cancellation: null,
        cancellationEligibility: { kind: "available" },
        consequences,
        ...overrides,
    };
}
function view(member = membership(), readOnly = false): MemberBillingView {
    return { readOnly, memberships: [member] };
}
function deferred() {
    let resolve!: (value: unknown) => void;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    mockMimic = { kind: "inactive" };
});
afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    jest.useRealTimers();
});

test("review exposes full-month and access consequences before sending the frozen confirmation", async () => {
    fetchMock.mockResolvedValueOnce(response(view()));
    render(<MemberBilling />);
    expect(screen.queryByText(copy.readOnly)).not.toBeInTheDocument();
    await screen.findByRole("heading", { name: "Members Library" });
    expect(
        screen.getByText(money(11, "nzd").replace(/\s/g, " ")),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole("link", { name: copy.receipt }),
    ).not.toBeInTheDocument();
    const quote = operation();
    fetchMock.mockResolvedValueOnce(
        response({ kind: "operation", operation: quote }),
    );
    fireEvent.click(screen.getByRole("button", { name: copy.cancel }));
    const dialog = await screen.findByRole("dialog");
    for (const text of [
        copy.fullMonth,
        copy.archive,
        copy.drops,
        copy.count(3),
        money(800, "nzd", true),
    ])
        expect(
            within(dialog).getByText(text.replace(/\s/g, " ")),
        ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        action: "prepare",
        membershipId: "membership-1",
    });
    const result = operation({
        phase: "canceled",
        access: "ended",
        canConfirm: false,
        canReconcile: true,
        refund: {
            kind: "refund",
            status: "pending",
            amount: 800,
            currency: "nzd",
        },
        closingGift: { consequences, libraryHref: "/dashboard/my-content" },
    });
    fetchMock.mockResolvedValueOnce(
        response({ kind: "operation", operation: result }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: copy.confirm }));
    await screen.findByRole("heading", { name: copy.cancelled, level: 2 });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
        action: "confirm",
        operationId: "operation-1",
        quoteHash: "frozen-hash",
    });
    expect(
        within(screen.getByRole("dialog")).getByText(copy.refundPending),
    ).toBeInTheDocument();
    expect(screen.queryByText(copy.refundSucceeded)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.refund)).not.toBeInTheDocument();
    expect(screen.getByText(copy.refundReviewed)).toBeInTheDocument();
    expect(screen.getByText(copy.refundedBeforeRequest)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByText(copy.farewellTitle)).toBeInTheDocument();
});

test("an uncertain result rechecks the same operation and blocks duplicate commands while waiting", async () => {
    const uncertain = operation({
        phase: "uncertain",
        access: "capped",
        canConfirm: false,
        canReconcile: true,
        refund: { kind: "uncertain" },
    });
    fetchMock.mockResolvedValueOnce(
        response(view(membership({ cancellation: uncertain }))),
    );
    render(<MemberBilling />);
    await screen.findByText(copy.cancellationUncertain);
    expect(screen.queryByText(copy.farewellTitle)).not.toBeInTheDocument();
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise);
    const refresh = screen.getByRole("button", { name: copy.refresh });
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        action: "reconcile",
        operationId: "operation-1",
        quoteHash: "frozen-hash",
    });
    await act(async () => {
        pending.resolve(response({ kind: "operation", operation: uncertain }));
    });
    expect(
        within(screen.getByRole("dialog")).getByText(copy.refundUncertain),
    ).toBeInTheDocument();
});

test("saved details remain visible in Mimic, with all financial mutations disabled", async () => {
    fetchMock.mockResolvedValueOnce(response(view(membership(), true)));
    render(<MemberBilling />);
    await screen.findByRole("heading", { name: "Members Library" });
    expect(screen.getByText(copy.readOnly)).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: copy.cancel });
    expect(cancel).toBeDisabled();
    fireEvent.click(cancel);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a changed Mimic subject removes former billing data and discards a late command response", async () => {
    fetchMock.mockResolvedValueOnce(response(view()));
    const { rerender } = render(<MemberBilling />);
    await screen.findByRole("heading", { name: "Members Library" });
    const command = deferred();
    fetchMock.mockReturnValueOnce(command.promise);
    fireEvent.click(screen.getByRole("button", { name: copy.cancel }));
    mockMimic = {
        kind: "active",
        actor: { userId: "admin", name: "Admin", email: "admin@example.com" },
        subject: {
            userId: "next-member",
            name: "Next member",
            email: "next@example.com",
        },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        returnTo: "/dashboard/users",
    };
    const nextRead = deferred();
    fetchMock.mockReturnValueOnce(nextRead.promise);
    rerender(<MemberBilling />);
    expect(
        screen.queryByRole("heading", { name: "Members Library" }),
    ).not.toBeInTheDocument();
    await act(async () => {
        command.resolve(
            response({ kind: "operation", operation: operation() }),
        );
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
        nextRead.resolve(
            response(
                view(membership({ productName: "Next member library" }), true),
            ),
        );
    });
    expect(
        screen.getByRole("heading", { name: "Next member library" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.cancel })).toBeDisabled();
});

test("a quote expiring while open disables confirmation", () => {
    jest.useFakeTimers();
    const quote = operation();
    quote.quote.expiresAt = new Date(Date.now() + 1000).toISOString();
    const confirm = jest.fn();
    render(
        <CancellationReview
            operation={quote}
            productName="Library"
            busy={false}
            readOnly={false}
            onClose={jest.fn()}
            onConfirm={confirm}
            onReconcile={jest.fn()}
        />,
    );
    expect(screen.getByRole("button", { name: copy.confirm })).toBeEnabled();
    act(() => {
        jest.advanceTimersByTime(1001);
    });
    expect(screen.getByRole("button", { name: copy.confirm })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(copy.expired);
    fireEvent.click(screen.getByRole("button", { name: copy.confirm }));
    expect(confirm).not.toHaveBeenCalled();
});

test.each(["failed", "canceled"] as const)(
    "a %s refund never claims money was returned",
    (status) => {
        render(
            <RefundStatus
                value={{ kind: "refund", status, amount: 800, currency: "nzd" }}
            />,
        );
        expect(screen.getByText(copy.refundFailed)).toBeInTheDocument();
        expect(
            screen.queryByText(copy.refundSucceeded),
        ).not.toBeInTheDocument();
    },
);

test("formats Stripe charge units independently of native invoice units", () => {
    expect(money(1100, "nzd", true)).toEqual(money(11, "nzd"));
    expect(money(1100, "jpy", true)).toEqual(money(1100, "jpy"));
    expect(money(1100, "isk", true)).toEqual(money(11, "isk"));
    expect(money(-1, "nzd", true)).toBe(copy.amountUnavailable);
});
