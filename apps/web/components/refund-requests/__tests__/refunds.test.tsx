import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { UIConstants, type MemberMimicView } from "@courselit/common-models";
import type {
    RefundRequestView,
    MemberRefundRequestsView,
} from "@/services/refund-requests/types";
import MemberRefunds from "../member";
import { RequestCard } from "../request-card";
import { OperatorActions } from "../operator-actions";
import { refundCopy as copy, refundStatus } from "../copy";
import { money } from "@/components/member-billing/format";
import { refundSummaryCopy } from "@/components/refund-summary/copy";
import OperatorRefunds from "../operator";
import { ProfileContext } from "@/components/contexts";
let mockMimic: MemberMimicView = { kind: "inactive" };
jest.mock("@/components/member-mimic/context", () => ({
    useMemberMimic: () => mockMimic,
}));
const originalFetch = global.fetch,
    fetchMock = jest.fn();
const response = (value: unknown) => ({ ok: true, json: async () => value });
function request(
    overrides: Partial<RefundRequestView> = {},
): RefundRequestView {
    return {
        requestId: "request",
        invoiceId: "invoice",
        productName: "Practice course",
        reason: "Please review my purchase.",
        state: "draft",
        routing: "purchase-review",
        assignedTo: "Al",
        quote: {
            hash: "quote",
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            amount: 4200,
            paidAmount: 5000,
            alreadyRefundedAmount: 800,
            currency: "nzd",
            mode: "test",
        },
        consequences: {
            accessDecision: "policy-pending",
            affectsSubscription: false,
            otherPurchases: "unchanged",
            classStart: null,
            timeZone: "UTC",
            explanation: "Needs a decision",
        },
        refund: { kind: "not-started" },
        access: "unchanged",
        notification: {
            kind: "private-review-queue",
            delivery: "not-configured",
        },
        reviewHash: "reviewed-hash",
        decisionExplanation: null,
        submittedAt: null,
        updatedAt: new Date().toISOString(),
        canSubmit: true,
        canReconcile: false,
        canApprove: false,
        canDecline: false,
        canEscalate: false,
        receiptHref: "/dashboard/receipts/invoice",
        ...overrides,
    };
}
function view(
    saved: RefundRequestView | null = null,
    readOnly = false,
): MemberRefundRequestsView {
    return {
        readOnly,
        membershipHref: "/dashboard/membership",
        products: [
            {
                invoiceId: "invoice",
                productName: "Practice course",
                amount: 50,
                currency: "nzd",
                mode: "test",
                request: saved,
                receiptHref: "/dashboard/receipts/invoice",
            },
        ],
    };
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

test("reviews a private text draft with the exact remaining amount before submitting it", async () => {
    fetchMock.mockResolvedValueOnce(response(view()));
    render(<MemberRefunds />);
    await screen.findByRole("heading", { name: "Practice course" });
    expect(
        screen.queryByRole("button", { name: copy.submit }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: copy.reason }), {
        target: { value: "Please review my purchase." },
    });
    fetchMock.mockResolvedValueOnce(response(request()));
    fireEvent.click(screen.getByRole("button", { name: copy.prepare }));
    await screen.findByRole("button", { name: copy.submit });
    expect(
        screen.getByText(money(4200, "nzd", true).replace(/\s/g, " ")),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.pendingPolicy)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        action: "prepare",
        invoiceId: "invoice",
        reason: "Please review my purchase.",
    });
    fetchMock.mockResolvedValueOnce(
        response(request({ state: "submitted", canSubmit: false })),
    );
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
    await screen.findByText("Waiting for review · Al");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
        action: "submit",
        requestId: "request",
        reviewHash: "reviewed-hash",
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.receipt })).toHaveAttribute(
        "href",
        "/dashboard/receipts/invoice",
    );
});
test("keeps typed text after a failed request and never submits changed text without rereview", async () => {
    fetchMock.mockResolvedValueOnce(response(view(request())));
    render(<MemberRefunds />);
    const textbox = await screen.findByRole("textbox", { name: copy.reason });
    fireEvent.change(textbox, { target: { value: "A more precise reason" } });
    expect(screen.getByRole("button", { name: copy.submit })).toBeDisabled();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: copy.prepare }));
    await screen.findByRole("alert");
    expect(textbox).toHaveValue("A more precise reason");
    expect(screen.getByRole("button", { name: copy.submit })).toBeDisabled();
});
test("Mimic shows only read-only submitted details and discards a former subject's late response", async () => {
    fetchMock.mockResolvedValueOnce(response(view()));
    const { rerender } = render(<MemberRefunds />);
    await screen.findByRole("textbox");
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Private pending reason" },
    });
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: copy.prepare }));
    mockMimic = {
        kind: "active",
        actor: { userId: "admin", name: "Admin", email: "admin@example.com" },
        subject: { userId: "other", name: "Other", email: "other@example.com" },
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        returnTo: "/dashboard/users",
    };
    fetchMock.mockResolvedValueOnce(
        response(
            view(
                request({
                    productName: "Other member course",
                    state: "submitted",
                    canSubmit: false,
                }),
                true,
            ),
        ),
    );
    rerender(<MemberRefunds />);
    expect(
        screen.queryByDisplayValue("Private pending reason"),
    ).not.toBeInTheDocument();
    await act(async () => {
        pending.resolve(
            response(request({ reason: "Private pending reason" })),
        );
    });
    await screen.findByRole("heading", { name: "Other member course" });
    expect(
        screen.queryByText("Private pending reason"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(copy.readOnly)).toBeInTheDocument();
});
test("uncertain refund checks the existing operation once while a response is pending", async () => {
    const saved = request({
        state: "approved",
        canSubmit: false,
        canReconcile: true,
        refund: { kind: "uncertain" },
    });
    fetchMock.mockResolvedValueOnce(response(view(saved)));
    render(<MemberRefunds />);
    const button = await screen.findByRole("button", {
        name: "Check existing refund",
    });
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        action: "reconcile",
        requestId: "request",
        reviewHash: "reviewed-hash",
    });
    await act(async () => {
        pending.resolve(response(saved));
    });
    expect(screen.getByText(refundStatus(saved.refund))).toBeInTheDocument();
});
test.each(["pending", "failed", "canceled", "requires_action"] as const)(
    "%s never displays a completed refund",
    (status) => {
        render(
            <RequestCard
                request={request({
                    state: "approved",
                    refund: { kind: "refund", status },
                })}
                showReceipt={false}
            />,
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            refundStatus({ kind: "refund", status }),
        );
        expect(
            screen.queryByText(/confirmed the refund/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("link", { name: copy.receipt }),
        ).not.toBeInTheDocument();
    },
);
test("operator approval requires an explanation and a current consequence review", () => {
    jest.useFakeTimers();
    const saved = request({
        state: "submitted",
        canSubmit: false,
        canApprove: true,
        canDecline: true,
        canEscalate: true,
    });
    saved.quote!.expiresAt = new Date(Date.now() + 1000).toISOString();
    const command = jest.fn();
    render(<OperatorActions request={saved} busy={false} command={command} />);
    expect(screen.getByRole("button", { name: copy.approve })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: copy.explanation }), {
        target: { value: "Verified amount and consequence" },
    });
    expect(screen.getByRole("button", { name: copy.approve })).toBeEnabled();
    act(() => {
        jest.advanceTimersByTime(1001);
    });
    expect(screen.getByRole("button", { name: copy.approve })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(copy.expired);
    fireEvent.click(screen.getByRole("button", { name: copy.escalate }));
    expect(command).toHaveBeenCalledWith({
        action: "escalate",
        requestId: "request",
        reviewHash: "reviewed-hash",
        explanation: "Verified amount and consequence",
    });
});
test("member requests show external money history while the policy decision remains pending", async () => {
    const saved = request({ state: "submitted", canSubmit: false });
    const payload = view(saved, true);
    payload.products[0].refundSummary = {
        kind: "observed",
        currency: "nzd",
        refundedAmount: 12.5,
        refunds: [{ status: "succeeded", amount: 12.5 }],
        observedAt: "2026-09-07T10:00:00Z",
    };
    fetchMock.mockResolvedValueOnce(response(payload));
    render(<MemberRefunds />);
    await screen.findByText(refundSummaryCopy.states.succeeded);
    expect(screen.getByText(copy.pendingPolicy)).toBeInTheDocument();
    expect(screen.getByText("Waiting for review · Al")).toBeInTheDocument();
    expect(
        screen.getByText("No refund has been sent through this request."),
    ).toBeInTheDocument();
    expect(
        screen.getByText(refundSummaryCopy.alreadyAtReview),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/NZD\s12\.50/)).toHaveLength(2);
    expect(screen.getByText(/NZD\s50\.00/)).toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: copy.approve }),
    ).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => !init.method)).toBe(true);
});
test("a completed request does not call a later failed payment refund complete", () => {
    render(
        <RequestCard
            request={request({
                state: "complete",
                refund: { kind: "refund", status: "failed" },
                refundSummary: {
                    kind: "observed",
                    currency: "nzd",
                    refundedAmount: 0,
                    refunds: [{ status: "failed", amount: 42 }],
                    observedAt: "2026-09-07T10:00:00Z",
                },
            })}
        />,
    );
    expect(screen.getByText("Request completed")).toBeInTheDocument();
    expect(
        screen.getByText(refundSummaryCopy.states.failed),
    ).toBeInTheDocument();
    expect(screen.queryByText("Refund complete")).not.toBeInTheDocument();
});
test("operator review refreshes the safe money summary after a command without approving a pending policy", async () => {
    const first = request({
        state: "submitted",
        canSubmit: false,
        refundSummary: {
            kind: "observed",
            currency: "nzd",
            refundedAmount: 0,
            refunds: [{ status: "pending", amount: 42 }],
            observedAt: "2026-09-07T10:00:00Z",
        },
    });
    fetchMock.mockResolvedValueOnce(response({ requests: [first] }));
    render(
        <ProfileContext.Provider
            value={
                {
                    profile: {
                        userId: "operator",
                        permissions: [UIConstants.permissions.manageSettings],
                    },
                } as any
            }
        >
            <OperatorRefunds />
        </ProfileContext.Provider>,
    );
    await screen.findByText(refundSummaryCopy.states.pending);
    const result = request({ state: "submitted", canSubmit: false });
    fetchMock.mockResolvedValueOnce(response(result));
    fetchMock.mockResolvedValueOnce(
        response({
            requests: [
                {
                    ...result,
                    refundSummary: {
                        kind: "observed",
                        currency: "nzd",
                        refundedAmount: 42,
                        refunds: [{ status: "succeeded", amount: 42 }],
                        observedAt: "2026-09-07T11:00:00Z",
                    },
                },
            ],
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: copy.paymentReview }));
    await screen.findByText(refundSummaryCopy.states.succeeded);
    expect(
        screen.queryByText(refundSummaryCopy.states.pending),
    ).not.toBeInTheDocument();
    expect(screen.getByText(copy.pendingPolicy)).toBeInTheDocument();
    expect(screen.getByText("Waiting for review · Al")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        action: "review",
        requestId: "request",
    });
    expect(fetchMock.mock.calls[2][0]).toBe("/api/refund-requests/review");
    expect(fetchMock.mock.calls[2][1].method).toBeUndefined();
});
test("booking selection requires explicit receipt evidence and does not select or invent a date", async () => {
    const command = jest.fn().mockResolvedValue(true);
    fetchMock.mockResolvedValueOnce(
        response({
            invoiceId: "invoice",
            choices: [
                {
                    cohortId: "class",
                    name: "Retreat class",
                    startAt: "2026-10-01T03:00:00Z",
                    timeZone: "UTC",
                },
            ],
        }),
    );
    render(
        <OperatorActions
            request={request({ state: "submitted" })}
            busy={false}
            command={command}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: copy.booking }));
    const select = await screen.findByRole("combobox", {
        name: "Actual class booking",
    });
    expect(select).toHaveValue("");
    expect(screen.queryByDisplayValue("2026-10-01")).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "class" } });
    fireEvent.change(
        screen.getByRole("textbox", { name: copy.bookingEvidence }),
        { target: { value: "Checked the dated booking against this receipt" } },
    );
    expect(
        screen.getByRole("button", { name: copy.bookingSave }),
    ).toBeDisabled();
    fireEvent.click(
        screen.getByRole("checkbox", { name: copy.bookingConfirm }),
    );
    fireEvent.click(screen.getByRole("button", { name: copy.bookingSave }));
    await act(async () => {});
    expect(command).toHaveBeenCalledWith({
        action: "verify-class",
        invoiceId: "invoice",
        cohortId: "class",
        explanation: "Checked the dated booking against this receipt",
        bookingVerified: true,
    });
});
