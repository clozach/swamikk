import type {
    StripeCancellationClient,
    StripeMonthlyCancellationQuote,
} from "@/payments-new/cancellation";
import {
    prepareStripeMonthlyCancellation,
    cancelStripeMonthlySubscription,
    reconcileStripeMonthlyRefund,
} from "@/payments-new/cancellation";

const start = Date.parse("2026-09-01T00:00:00Z") / 1000;
const end = Date.parse("2026-10-01T00:00:00Z") / 1000;
const now = new Date("2026-09-30T23:59:59Z");
const operationId = "cancel-operation-123";
let sub: any,
    invoice: any,
    charge: any,
    refunds: any[],
    client: StripeCancellationClient;
let api: {
    subscriptions: { retrieve: jest.Mock; cancel: jest.Mock };
    invoices: { retrieve: jest.Mock };
    charges: { retrieve: jest.Mock };
    refunds: { list: jest.Mock; create: jest.Mock };
};
const refund = (
    id: string,
    amount = 5000,
    status = "succeeded",
    metadata = {},
) => ({
    id,
    object: "refund",
    charge: "ch_current",
    amount,
    currency: "nzd",
    status,
    metadata,
    payment_intent: "pi_current",
});
const prepare = (extra = {}) =>
    prepareStripeMonthlyCancellation(client, {
        subscriptionId: "sub_monthly",
        paymentPlanType: "subscription",
        expectedLivemode: false,
        now,
        ...extra,
    });
async function quoted() {
    const result = await prepare();
    if (result.kind !== "ready") throw new Error(JSON.stringify(result));
    return result.quote;
}
const reconcile = (quote: StripeMonthlyCancellationQuote, extra = {}) =>
    reconcileStripeMonthlyRefund(client, {
        quote,
        operationId,
        firstAttemptAt: now.toISOString(),
        allowCreate: true,
        now,
        ...extra,
    });

beforeEach(() => {
    refunds = [];
    sub = {
        id: "sub_monthly",
        object: "subscription",
        customer: "cus_member",
        livemode: false,
        status: "active",
        current_period_start: start,
        current_period_end: end,
        latest_invoice: "in_current",
        metadata: {},
        schedule: null,
        pending_update: null,
        pause_collection: null,
        pending_invoice_item_interval: null,
        items: {
            has_more: false,
            data: [
                {
                    id: "si_monthly",
                    subscription: "sub_monthly",
                    quantity: 1,
                    price: {
                        id: "price_monthly",
                        currency: "nzd",
                        livemode: false,
                        recurring: {
                            interval: "month",
                            interval_count: 1,
                            usage_type: "licensed",
                        },
                    },
                },
            ],
        },
    };
    invoice = {
        id: "in_current",
        object: "invoice",
        subscription: "sub_monthly",
        customer: "cus_member",
        charge: "ch_current",
        payment_intent: "pi_current",
        livemode: false,
        currency: "nzd",
        billing_reason: "subscription_cycle",
        amount_paid: 5000,
        amount_due: 5000,
        total: 5000,
        amount_remaining: 0,
        starting_balance: 0,
        ending_balance: 0,
        paid: true,
        paid_out_of_band: false,
        status: "paid",
        lines: {
            has_more: false,
            data: [
                {
                    id: "il_monthly",
                    type: "subscription",
                    subscription: "sub_monthly",
                    subscription_item: "si_monthly",
                    price: { id: "price_monthly" },
                    quantity: 1,
                    currency: "nzd",
                    proration: false,
                    period: { start, end },
                },
            ],
        },
    };
    charge = {
        id: "ch_current",
        object: "charge",
        customer: "cus_member",
        invoice: "in_current",
        payment_intent: "pi_current",
        amount: 5000,
        amount_captured: 5000,
        amount_refunded: 0,
        livemode: false,
        currency: "nzd",
        paid: true,
        captured: true,
        status: "succeeded",
        disputed: false,
        transfer: null,
        transfer_data: null,
        application_fee: null,
        on_behalf_of: null,
    };
    api = {
        subscriptions: {
            retrieve: jest.fn(async () => sub),
            cancel: jest.fn(async () => {
                sub.status = "canceled";
                return sub;
            }),
        },
        invoices: { retrieve: jest.fn(async () => invoice) },
        charges: { retrieve: jest.fn(async () => charge) },
        refunds: {
            list: jest.fn(async () => ({ data: refunds, has_more: false })),
            create: jest.fn(async (body) =>
                refund("re_operation", body.amount, "succeeded", body.metadata),
            ),
        },
    };
    client = api as unknown as StripeCancellationClient;
});

test("last day quotes the entire paid current month in actual minor units and derives the customer", async () => {
    const quote = await quoted();
    expect(quote).toMatchObject({
        customerId: "cus_member",
        subscriptionId: "sub_monthly",
        invoiceId: "in_current",
        chargeId: "ch_current",
        mode: "test",
        currency: "nzd",
        paidAmount: 5000,
        refundedAmount: 0,
        refundableAmount: 5000,
        period: { start, end },
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
    expect(api.subscriptions.cancel).not.toHaveBeenCalled();
});
test("existing partial refund quotes only the remaining amount", async () => {
    charge.amount_refunded = 1200;
    refunds = [refund("re_partial", 1200)];
    expect(await quoted()).toMatchObject({
        paidAmount: 5000,
        refundedAmount: 1200,
        refundableAmount: 3800,
    });
});
test("already fully refunded current payment requires no additional refund", async () => {
    charge.amount_refunded = 5000;
    refunds = [refund("re_full")];
    const quote = await quoted();
    sub.status = "canceled";
    expect(await reconcile(quote)).toEqual({
        kind: "not-required",
        reason: "already-refunded",
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
test("unpaid current invoice never falls back to a previous month's payment", async () => {
    Object.assign(invoice, {
        status: "open",
        paid: false,
        amount_paid: 0,
        amount_remaining: 5000,
        charge: null,
    });
    const quote = await quoted();
    expect(quote).toMatchObject({
        payment: "unpaid",
        paidAmount: 0,
        refundableAmount: 0,
        chargeId: null,
    });
    await cancelStripeMonthlySubscription(client, quote);
    expect(await reconcile(quote)).toEqual({
        kind: "not-required",
        reason: "current-month-unpaid",
    });
    expect(api.charges.retrieve).not.toHaveBeenCalled();
    expect(api.refunds.create).not.toHaveBeenCalled();
});
test("a stale latest invoice is not mistaken for the current paid month", async () => {
    invoice.lines.data[0].period = { start: start - 31 * 86400, end: start };
    expect(await prepare()).toEqual({
        kind: "review-required",
        reason: "no-current-invoice",
    });
    expect(api.charges.retrieve).not.toHaveBeenCalled();
});
test.each(["emi", "one-time", "annual"])(
    "local plan type %s requires review even when its price looks monthly",
    async (paymentPlanType) => {
        expect(await prepare({ paymentPlanType })).toEqual({
            kind: "review-required",
            reason: "unsupported-plan",
        });
    },
);
test.each([
    "annual",
    "multi-item",
    "metered",
    "schedule",
    "proration",
    "mixed-invoice",
])("complex provider case %s requires review", async (kind) => {
    if (kind === "annual") sub.items.data[0].price.recurring.interval = "year";
    if (kind === "multi-item")
        sub.items.data.push({ ...sub.items.data[0], id: "si_other" });
    if (kind === "metered")
        sub.items.data[0].price.recurring.usage_type = "metered";
    if (kind === "schedule") sub.schedule = "sub_sched_emi";
    if (kind === "proration") invoice.lines.data[0].proration = true;
    if (kind === "mixed-invoice")
        invoice.lines.data.push({
            ...invoice.lines.data[0],
            type: "invoiceitem",
        });
    expect(await prepare()).toMatchObject({ kind: "review-required" });
});
test.each([
    "invoice-id",
    "invoice-subscription",
    "invoice-customer",
    "item-subscription",
    "price-mode",
    "price-currency",
    "charge-invoice",
    "charge-customer",
    "intent",
    "currency",
    "mode",
])("verifies the native %s relation", async (kind) => {
    if (kind === "invoice-id") invoice.id = "in_other";
    if (kind === "invoice-subscription") invoice.subscription = "sub_other";
    if (kind === "invoice-customer") invoice.customer = "cus_other";
    if (kind === "item-subscription")
        sub.items.data[0].subscription = "sub_other";
    if (kind === "price-mode") sub.items.data[0].price.livemode = true;
    if (kind === "price-currency") sub.items.data[0].price.currency = "usd";
    if (kind === "charge-invoice") charge.invoice = "in_other";
    if (kind === "charge-customer") charge.customer = "cus_other";
    if (kind === "intent") charge.payment_intent = "pi_other";
    if (kind === "currency") charge.currency = "usd";
    if (kind === "mode") charge.livemode = true;
    expect(await prepare()).toMatchObject({ kind: "review-required" });
});
test("optional membership metadata permits legacy absence but rejects an actual mismatch", async () => {
    expect(
        await prepare({ expectedMembershipId: "membership-local" }),
    ).toMatchObject({ kind: "ready" });
    sub.metadata.membershipId = "membership-other";
    expect(await prepare({ expectedMembershipId: "membership-local" })).toEqual(
        { kind: "review-required", reason: "membership-mismatch" },
    );
});
test("a prior pending refund waits for review instead of double-reserving the current charge", async () => {
    refunds = [refund("re_pending", 1200, "pending")];
    expect(await prepare()).toEqual({
        kind: "review-required",
        reason: "refund-in-progress",
    });
});
test("cancellation is immediate with final invoicing/proration disabled, and repeating is harmless", async () => {
    const quote = await quoted();
    expect(await cancelStripeMonthlySubscription(client, quote)).toEqual({
        kind: "canceled",
        subscriptionId: sub.id,
        alreadyCanceled: false,
    });
    expect(api.subscriptions.cancel).toHaveBeenCalledWith(sub.id, {
        invoice_now: false,
        prorate: false,
    });
    expect(await cancelStripeMonthlySubscription(client, quote)).toMatchObject({
        kind: "canceled",
        alreadyCanceled: true,
    });
    expect(api.subscriptions.cancel).toHaveBeenCalledTimes(1);
});
test("a cycle change invalidates cancellation review instead of silently changing its charge", async () => {
    const quote = await quoted();
    sub.current_period_start = end;
    sub.current_period_end = end + 31 * 86400;
    expect(await cancelStripeMonthlySubscription(client, quote)).toEqual({
        kind: "review-required",
        reason: "period-changed",
    });
    expect(api.subscriptions.cancel).not.toHaveBeenCalled();
});
test("adding another item after review prevents cancellation of a complex subscription", async () => {
    const quote = await quoted();
    sub.items.data.push({ ...sub.items.data[0], id: "si_other" });
    expect(await cancelStripeMonthlySubscription(client, quote)).toEqual({
        kind: "review-required",
        reason: "unsupported-subscription",
    });
    expect(api.subscriptions.cancel).not.toHaveBeenCalled();
});
test("persistence key reordering preserves the reviewed quote hash", async () => {
    const quote = await quoted();
    const reordered = Object.fromEntries(Object.entries(quote).reverse());
    reordered.period = { end, start };
    expect(
        await cancelStripeMonthlySubscription(
            client,
            reordered as unknown as StripeMonthlyCancellationQuote,
        ),
    ).toMatchObject({ kind: "canceled" });
});
test("persistence key reordering in refund history preserves the exact partial-refund review", async () => {
    charge.amount_refunded = 1200;
    refunds = [refund("re_partial", 1200)];
    const quote = await quoted();
    quote.existingRefunds = quote.existingRefunds.map((r) => ({
        status: r.status,
        amount: r.amount,
        id: r.id,
    }));
    sub.status = "canceled";
    expect(await reconcile(quote)).toMatchObject({
        kind: "refund",
        amount: 3800,
    });
});
test("cancellation timeout remains uncertain, then reconciles an already canceled subscription", async () => {
    const quote = await quoted();
    api.subscriptions.cancel.mockImplementationOnce(async () => {
        sub.status = "canceled";
        throw new Error("timeout");
    });
    expect(await cancelStripeMonthlySubscription(client, quote)).toEqual({
        kind: "uncertain",
    });
    expect(await cancelStripeMonthlySubscription(client, quote)).toMatchObject({
        kind: "canceled",
        alreadyCanceled: true,
    });
});
test("first refund uses the exact reviewed amount, charge, stable metadata and idempotency key", async () => {
    charge.amount_refunded = 1200;
    refunds = [refund("re_partial", 1200)];
    const quote = await quoted();
    sub.status = "canceled";
    expect(await reconcile(quote)).toMatchObject({
        kind: "refund",
        status: "succeeded",
        amount: 3800,
    });
    expect(api.refunds.create).toHaveBeenCalledWith(
        {
            charge: "ch_current",
            amount: 3800,
            metadata: {
                kk_cancellation_operation: operationId,
                kk_cancellation_quote: quote.quoteHash,
                kk_cancellation_invoice: "in_current",
            },
        },
        { idempotencyKey: `kk-cancel-refund:${operationId}` },
    );
});
test("another refund after review does not silently reduce the frozen amount", async () => {
    const quote = await quoted();
    sub.status = "canceled";
    charge.amount_refunded = 1200;
    refunds = [refund("re_external", 1200)];
    expect(await reconcile(quote)).toEqual({
        kind: "review-required",
        reason: "amount-changed",
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
test.each(["pending", "succeeded", "failed", "canceled", "requires_action"])(
    "reconciles operation refund state %s without creating again",
    async (status) => {
        const quote = await quoted();
        sub.status = "canceled";
        refunds = [
            refund("re_operation", 5000, status, {
                kk_cancellation_operation: operationId,
                kk_cancellation_quote: quote.quoteHash,
            }),
        ];
        expect(await reconcile(quote, { allowCreate: false })).toMatchObject({
            kind: "refund",
            refundId: "re_operation",
            status,
        });
        expect(api.refunds.create).not.toHaveBeenCalled();
    },
);
test("timeout followed by no matching metadata remains uncertain even beyond key retention", async () => {
    const quote = await quoted();
    sub.status = "canceled";
    api.refunds.create.mockRejectedValueOnce(new Error("provider timeout"));
    expect(await reconcile(quote)).toEqual({ kind: "uncertain" });
    expect(
        await reconcile(quote, {
            allowCreate: false,
            now: new Date(now.getTime() + 7 * 86400000),
        }),
    ).toEqual({ kind: "uncertain" });
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
});
test("an old purported first attempt cannot recreate a pruned idempotency key", async () => {
    const quote = await quoted();
    sub.status = "canceled";
    expect(
        await reconcile(quote, { firstAttemptAt: "2026-09-01T00:00:00Z" }),
    ).toEqual({ kind: "review-required", reason: "operation-mismatch" });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
test("reconciliation paginates all charge refunds and uses the frozen invoice after cancellation", async () => {
    const quote = await quoted();
    sub.status = "canceled";
    sub.latest_invoice = "in_unrelated_later";
    sub.current_period_end = end + 86400;
    api.refunds.list
        .mockResolvedValueOnce({
            data: [refund("re_old", 1, "failed")],
            has_more: true,
        })
        .mockResolvedValueOnce({
            data: [
                refund("re_operation", 5000, "pending", {
                    kk_cancellation_operation: operationId,
                    kk_cancellation_quote: quote.quoteHash,
                }),
            ],
            has_more: false,
        });
    expect(await reconcile(quote, { allowCreate: false })).toMatchObject({
        kind: "refund",
        status: "pending",
    });
    expect(api.refunds.list).toHaveBeenLastCalledWith({
        charge: "ch_current",
        limit: 100,
        starting_after: "re_old",
    });
});
test("a matching operation ID with the wrong reviewed quote needs review", async () => {
    const quote = await quoted();
    sub.status = "canceled";
    refunds = [
        refund("re_wrong", 5000, "succeeded", {
            kk_cancellation_operation: operationId,
            kk_cancellation_quote: "wrong",
        }),
    ];
    expect(await reconcile(quote)).toEqual({
        kind: "review-required",
        reason: "operation-mismatch",
    });
});
test("refund failure does not undo the provider cancellation", async () => {
    const quote = await quoted();
    await cancelStripeMonthlySubscription(client, quote);
    api.refunds.create.mockRejectedValue({
        type: "StripeInvalidRequestError",
        message: "private provider message",
    });
    expect(await reconcile(quote)).toEqual({
        kind: "review-required",
        reason: "provider-rejected",
    });
    expect(sub.status).toBe("canceled");
});
test("a tampered frozen amount fails before provider mutation", async () => {
    const quote = await quoted();
    sub.status = "canceled";
    expect(await reconcile({ ...quote, refundableAmount: 4999 })).toEqual({
        kind: "review-required",
        reason: "invalid-quote",
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
