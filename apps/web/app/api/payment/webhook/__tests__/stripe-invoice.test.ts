/** @jest-environment node */
import mongoose from "mongoose";
import Stripe from "stripe";
import { Constants, Membership } from "@courselit/common-models";
import Invoice from "@models/Invoice";
import { recordStripeInvoice } from "../stripe-invoice";
import StripePayment from "@/payments-new/stripe-payment";
import {
    fromStripeAmount,
    toStripeAmount,
} from "@/payments-new/stripe-currency";

const domain = new mongoose.Types.ObjectId();
const membership = {
    membershipId: "receipt-member",
    sessionId: "receipt-session",
} as Membership;
const initialId = "receipt-original";
const event = (
    type: "checkout.session.completed" | "invoice.paid",
    id: string,
) =>
    ({
        id: `evt-${id}`,
        type,
        livemode: false,
        data: {
            object: {
                id,
                currency: "nzd",
                amount_total: 550,
                amount_paid: 550,
            },
        },
    }) as unknown as Stripe.Event;

beforeEach(async () => {
    await Invoice.create({
        domain,
        invoiceId: initialId,
        membershipId: membership.membershipId,
        membershipSessionId: membership.sessionId,
        amount: 11,
        currencyISOCode: "NZD",
        paymentProcessor: "stripe",
        status: Constants.InvoiceStatus.PENDING,
    });
});
afterEach(async () => {
    await Invoice.deleteMany({ domain });
});

it("records the settled discounted amount and tolerates concurrent initial delivery", async () => {
    await Promise.all(
        Array.from({ length: 6 }, () =>
            recordStripeInvoice(
                event("checkout.session.completed", "cs_test_first"),
                domain,
                initialId,
                membership,
            ),
        ),
    );
    const invoices = await Invoice.find({ domain });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
        amount: 5.5,
        status: Constants.InvoiceStatus.PAID,
        paymentMode: "test",
    });
});

it("creates one renewal for concurrent/replayed events, independent of the old order state", async () => {
    await Promise.all(
        Array.from({ length: 8 }, () =>
            recordStripeInvoice(
                event("invoice.paid", "in_renewal"),
                domain,
                initialId,
                membership,
            ),
        ),
    );
    expect(await Invoice.countDocuments({ domain })).toBe(2);
    const paid = await Invoice.findOne({
        domain,
        paymentProcessorTransactionId: "in_renewal",
    });
    expect(paid).toMatchObject({ amount: 5.5, paymentMode: "test" });
});

it("does not duplicate a historically recorded renewal with a generated local invoice ID", async () => {
    await Invoice.create({
        domain,
        invoiceId: "legacy-renewal",
        membershipId: membership.membershipId,
        membershipSessionId: membership.sessionId,
        paymentProcessor: "stripe",
        currencyISOCode: "NZD",
        amount: 11,
        status: Constants.InvoiceStatus.PAID,
        paymentProcessorTransactionId: "in_old",
    });
    await recordStripeInvoice(
        event("invoice.paid", "in_old"),
        domain,
        initialId,
        membership,
    );
    expect(await Invoice.countDocuments({ domain })).toBe(2);
});

it("rejects foreign orders, currency changes and a prior membership session without writes", async () => {
    await expect(
        recordStripeInvoice(
            event("invoice.paid", "in_other"),
            new mongoose.Types.ObjectId(),
            initialId,
            membership,
        ),
    ).rejects.toThrow("current order");
    await expect(
        recordStripeInvoice(
            event("invoice.paid", "in_old_session"),
            domain,
            initialId,
            { ...membership, sessionId: "new-session" },
        ),
    ).rejects.toThrow("current order");
    const wrongCurrency = event(
        "checkout.session.completed",
        "cs_test_currency",
    );
    (wrongCurrency.data.object as any).currency = "usd";
    await expect(
        recordStripeInvoice(wrongCurrency, domain, initialId, membership),
    ).rejects.toThrow("current order");
    expect(await Invoice.countDocuments({ domain })).toBe(1);
    expect((await Invoice.findOne({ domain })).status).toBe(
        Constants.InvoiceStatus.PENDING,
    );
});

it("rejects another charge trying to settle the same checkout", async () => {
    await recordStripeInvoice(
        event("checkout.session.completed", "cs_test_first"),
        domain,
        initialId,
        membership,
    );
    await expect(
        recordStripeInvoice(
            event("checkout.session.completed", "cs_test_second"),
            domain,
            initialId,
            membership,
        ),
    ).rejects.toThrow("another payment");
    expect(await Invoice.countDocuments({ domain })).toBe(1);
});

it("keeps subscription metadata through old and new Stripe invoice shapes", () => {
    const adapter = new StripePayment({});
    const metadata = { membershipId: "member", invoiceId: "order" };
    for (const object of [
        { subscription: "sub-old", subscription_details: { metadata } },
        {
            parent: {
                subscription_details: {
                    metadata,
                    subscription: { id: "sub-old" },
                },
            },
        },
    ]) {
        const input = { type: "invoice.paid", data: { object } } as any;
        expect(adapter.getMetadata(input)).toEqual(metadata);
        expect(adapter.getSubscriptionId(input)).toBe("sub-old");
    }
    expect(
        adapter.getMetadata({
            type: "invoice.paid",
            data: { object: {} },
        } as any),
    ).toEqual({});
});

it("converts Stripe charge units without applying NZD cents to a zero-decimal currency", () => {
    expect(toStripeAmount(11, "NZD")).toBe(1100);
    expect(fromStripeAmount(550, "NZD")).toBe(5.5);
    expect(toStripeAmount(500, "JPY")).toBe(500);
    expect(fromStripeAmount(500, "JPY")).toBe(500);
    expect(toStripeAmount(5, "ISK")).toBe(500);
    expect(toStripeAmount(5, "UGX")).toBe(500);
    expect(() => toStripeAmount(5.2, "UGX")).toThrow("whole-number");
    expect(() => fromStripeAmount(-1, "NZD")).toThrow("amount");
});

it("puts correlation metadata on the subscription as well as its checkout session", async () => {
    const adapter = new StripePayment({ currencyISOCode: "NZD" });
    adapter.stripe = {
        checkout: {
            sessions: {
                create: jest.fn().mockResolvedValue({
                    url: "https://checkout.stripe.com/test",
                }),
            },
        },
    };
    const metadata = { membershipId: "m", invoiceId: "i" };
    await adapter.initiate({
        metadata,
        origin: "https://school.example",
        product: {
            id: "c",
            title: "Membership",
            type: Constants.MembershipEntityType.COURSE,
        },
        paymentPlan: {
            type: Constants.PaymentPlanType.SUBSCRIPTION,
            subscriptionMonthlyAmount: 11,
        } as any,
    });
    expect(adapter.stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata, subscription_data: { metadata } }),
    );
});
