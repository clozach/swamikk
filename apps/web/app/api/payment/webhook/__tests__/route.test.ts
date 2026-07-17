/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import Stripe from "stripe";
import mongoose from "mongoose";
import { POST } from "../route";
import Domain from "@models/Domain";
import Membership from "@models/Membership";
import PaymentPlan from "@models/PaymentPlan";
import Invoice from "@models/Invoice";
import { getPaymentMethod } from "@/payments-new";
import StripePayment from "../../../../../payments-new/stripe-payment";
import { Constants } from "@courselit/common-models";

jest.mock("@models/Domain");
jest.mock("@models/Membership");
jest.mock("@models/PaymentPlan");
jest.mock("@models/Invoice");
jest.mock("@/payments-new");
jest.mock("../../helpers");

const { activateMembership } = jest.requireMock("../../helpers");

const WEBHOOK_SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy");

const eventPayload = JSON.stringify({
    id: "evt_123",
    type: "checkout.session.completed",
    data: {
        object: {
            id: "cs_123",
            payment_status: "paid",
            metadata: {
                membershipId: "membership-123",
                invoiceId: "invoice-123",
                currencyISOCode: "usd",
            },
        },
    },
});

function makeRequest({
    payload = eventPayload,
    signature,
}: {
    payload?: string;
    signature?: string | null;
}) {
    const headers = new Headers({ domain: "test.com" });
    if (signature) {
        headers.set("stripe-signature", signature);
    }
    return {
        text: jest.fn().mockResolvedValue(payload),
        headers,
    } as unknown as NextRequest;
}

async function makeStripePayment(siteinfo: Record<string, unknown>) {
    return await new StripePayment({
        currencyISOCode: "usd",
        stripeKey: "pk_test_dummy",
        stripeSecret: "sk_test_dummy",
        ...siteinfo,
    }).setup();
}

describe("Payment Webhook Route (Stripe)", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        (Domain.findOne as jest.Mock).mockResolvedValue({
            _id: new mongoose.Types.ObjectId("666666666666666666666666"),
            name: "test.com",
        });

        (Membership.findOne as jest.Mock).mockResolvedValue({
            membershipId: "membership-123",
            sessionId: "session-123",
            paymentPlanId: "plan-123",
            save: jest.fn().mockResolvedValue(undefined),
        });

        (PaymentPlan.findOne as jest.Mock).mockResolvedValue({
            planId: "plan-123",
            type: Constants.PaymentPlanType.ONE_TIME,
            oneTimeAmount: 99.99,
            internal: false,
        });

        (Invoice.findOne as jest.Mock).mockResolvedValue({
            invoiceId: "invoice-123",
            status: Constants.InvoiceStatus.PENDING,
            save: jest.fn().mockResolvedValue(undefined),
        });

        (activateMembership as jest.Mock).mockResolvedValue(undefined);
    });

    describe("with a webhook secret configured", () => {
        beforeEach(async () => {
            (getPaymentMethod as jest.Mock).mockResolvedValue(
                await makeStripePayment({
                    stripeWebhookSecret: WEBHOOK_SECRET,
                }),
            );
        });

        it("accepts an event with a valid signature", async () => {
            const signature = stripe.webhooks.generateTestHeaderString({
                payload: eventPayload,
                secret: WEBHOOK_SECRET,
            });

            const response = await POST(makeRequest({ signature }));

            expect(await response.json()).toEqual({ message: "success" });
            expect(activateMembership).toHaveBeenCalled();
        });

        it("rejects an event whose payload does not match the signature", async () => {
            const signature = stripe.webhooks.generateTestHeaderString({
                payload: eventPayload,
                secret: WEBHOOK_SECRET,
            });
            const tampered = eventPayload.replace(
                "membership-123",
                "membership-666",
            );

            const response = await POST(
                makeRequest({ payload: tampered, signature }),
            );

            expect(await response.json()).toEqual({
                message: "Payment not verified",
            });
            expect(activateMembership).not.toHaveBeenCalled();
        });

        it("rejects an event signed with the wrong secret", async () => {
            const signature = stripe.webhooks.generateTestHeaderString({
                payload: eventPayload,
                secret: "whsec_attacker",
            });

            const response = await POST(makeRequest({ signature }));

            expect(await response.json()).toEqual({
                message: "Payment not verified",
            });
            expect(activateMembership).not.toHaveBeenCalled();
        });

        it("rejects an event without a stripe-signature header", async () => {
            const response = await POST(makeRequest({ signature: null }));

            expect(await response.json()).toEqual({
                message: "Payment not verified",
            });
            expect(activateMembership).not.toHaveBeenCalled();
        });
    });

    describe("without a webhook secret configured", () => {
        beforeEach(async () => {
            (getPaymentMethod as jest.Mock).mockResolvedValue(
                await makeStripePayment({}),
            );
        });

        it("accepts an unsigned event for backward compatibility and logs a warning", async () => {
            const warnSpy = jest
                .spyOn(console, "warn")
                .mockImplementation(() => undefined);

            const response = await POST(makeRequest({ signature: null }));

            expect(await response.json()).toEqual({ message: "success" });
            expect(activateMembership).toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining("webhook secret is not configured"),
                undefined,
            );

            warnSpy.mockRestore();
        });

        it("still rejects events that do not represent a completed payment", async () => {
            const unpaid = eventPayload.replace(
                '"payment_status":"paid"',
                '"payment_status":"unpaid"',
            );

            const response = await POST(
                makeRequest({ payload: unpaid, signature: null }),
            );

            expect(await response.json()).toEqual({
                message: "Payment not verified",
            });
            expect(activateMembership).not.toHaveBeenCalled();
        });
    });
});
