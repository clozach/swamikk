import { preparePurchaseRefund } from "@/services/refund-requests/provider-quote";
import { reconcilePurchaseRefund } from "@/services/refund-requests/provider-refund";
import type {
    PurchaseRefundClient,
    PurchaseRefundInput,
    PurchaseRefundQuote,
} from "@/services/refund-requests/provider-types";

let session: any, intent: any, charge: any, refunds: any[], api: any;
const input: PurchaseRefundInput = {
    invoiceId: "local-invoice",
    membershipId: "local-member",
    membershipSessionId: "local-session",
    checkoutSessionId: "cs_paid",
    paidAmount: 5000,
    currency: "nzd",
    mode: "test",
};
const now = new Date();
const prepare = () =>
    preparePurchaseRefund(api as PurchaseRefundClient, input, now);
async function quote(): Promise<PurchaseRefundQuote> {
    const result = await prepare();
    if (result.kind !== "ready") throw new Error(JSON.stringify(result));
    return result.quote;
}
const reconcile = (review: PurchaseRefundQuote, extra = {}) =>
    reconcilePurchaseRefund(api as PurchaseRefundClient, {
        quote: review,
        operationId: "purchase-request",
        firstAttemptAt: now.toISOString(),
        allowCreate: true,
        now,
        ...extra,
    });
const refund = (
    id: string,
    amount: number,
    status = "succeeded",
    metadata = {},
) => ({ id, charge: "ch_paid", amount, status, metadata, currency: "nzd" });
beforeEach(() => {
    session = {
        id: "cs_paid",
        mode: "payment",
        subscription: null,
        status: "complete",
        payment_status: "paid",
        payment_intent: "pi_paid",
        customer: null,
        invoice: null,
        metadata: {
            invoiceId: input.invoiceId,
            membershipId: input.membershipId,
        },
        amount_total: 5000,
        currency: "nzd",
        livemode: false,
    };
    intent = {
        id: "pi_paid",
        status: "succeeded",
        amount: 5000,
        amount_received: 5000,
        amount_capturable: 0,
        currency: "nzd",
        customer: null,
        invoice: null,
        latest_charge: "ch_paid",
        livemode: false,
    };
    charge = {
        id: "ch_paid",
        customer: null,
        invoice: null,
        payment_intent: "pi_paid",
        amount: 5000,
        amount_captured: 5000,
        amount_refunded: 0,
        currency: "nzd",
        livemode: false,
        paid: true,
        captured: true,
        status: "succeeded",
    };
    refunds = [];
    api = {
        checkout: { sessions: { retrieve: jest.fn(async () => session) } },
        paymentIntents: { retrieve: jest.fn(async () => intent) },
        charges: { retrieve: jest.fn(async () => charge) },
        refunds: {
            list: jest.fn(async () => ({ data: refunds, has_more: false })),
            create: jest.fn(async (body: any) => {
                const result = refund(
                    "re_created",
                    body.amount,
                    "succeeded",
                    body.metadata,
                );
                refunds.push(result);
                charge.amount_refunded += body.amount;
                return result;
            }),
        },
    };
});
it("proves a guest Checkout payment with no Customer object and freezes actual paid money", async () => {
    expect(await quote()).toMatchObject({
        customerId: null,
        chargeId: "ch_paid",
        paymentIntentId: "pi_paid",
        currency: "nzd",
        mode: "test",
        paidAmount: 5000,
        refundableAmount: 5000,
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
it.each([
    "checkout-id",
    "invoice-metadata",
    "member-metadata",
    "intent-id",
    "charge-intent",
    "customer",
    "currency",
    "mode",
    "amount",
    "subscription",
    "uncaptured",
    "transfer",
])("rejects an unproven %s relationship", async (kind) => {
    if (kind === "checkout-id") session.id = "cs_other";
    if (kind === "invoice-metadata") session.metadata.invoiceId = "other";
    if (kind === "member-metadata") session.metadata.membershipId = "other";
    if (kind === "intent-id") intent.id = "pi_other";
    if (kind === "charge-intent") charge.payment_intent = "pi_other";
    if (kind === "customer") charge.customer = "cus_other";
    if (kind === "currency") intent.currency = "usd";
    if (kind === "mode") session.livemode = true;
    if (kind === "amount") charge.amount = 999;
    if (kind === "subscription") session.mode = "subscription";
    if (kind === "uncaptured") charge.captured = false;
    if (kind === "transfer")
        intent.transfer_data = { destination: "acct_other" };
    expect(await prepare()).toMatchObject({ kind: "review-required" });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
it("refunds only the frozen remaining balance and repeats through operation metadata", async () => {
    refunds = [refund("re_partial", 1200)];
    charge.amount_refunded = 1200;
    const review = await quote();
    expect(await reconcile(review)).toMatchObject({
        kind: "refund",
        amount: 3800,
        status: "succeeded",
    });
    expect(api.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ charge: "ch_paid", amount: 3800 }),
        { idempotencyKey: "kk-purchase-refund:purchase-request" },
    );
    expect(await reconcile(review, { allowCreate: false })).toMatchObject({
        kind: "refund",
        status: "succeeded",
    });
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
});
it("does not refund an already fully refunded purchase again", async () => {
    refunds = [refund("re_full", 5000)];
    charge.amount_refunded = 5000;
    expect(await reconcile(await quote())).toEqual({
        kind: "not-required",
        reason: "already-refunded",
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
it("keeps a timed-out create uncertain after idempotency retention rather than duplicating", async () => {
    const review = await quote();
    api.refunds.create.mockRejectedValueOnce(new Error("timeout"));
    expect(await reconcile(review)).toEqual({ kind: "uncertain" });
    expect(
        await reconcile(review, {
            allowCreate: false,
            now: new Date(now.getTime() + 7 * 86400000),
        }),
    ).toEqual({ kind: "uncertain" });
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
});
it.each(["pending", "succeeded", "failed", "canceled", "requires_action"])(
    "reconciles native %s without another create",
    async (status) => {
        const review = await quote();
        refunds = [
            refund("re_existing", 5000, status, {
                kk_purchase_refund: "purchase-request",
                kk_purchase_quote: review.hash,
            }),
        ];
        expect(await reconcile(review, { allowCreate: false })).toMatchObject({
            kind: "refund",
            status,
        });
        expect(api.refunds.create).not.toHaveBeenCalled();
    },
);
it("requires a new review if another refund changes the remaining balance", async () => {
    const review = await quote();
    refunds = [refund("re_external", 1000)];
    charge.amount_refunded = 1000;
    expect(await reconcile(review)).toEqual({
        kind: "review-required",
        reason: "amount-changed",
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
