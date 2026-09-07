import { retireUnstartedAllocation } from "./allocation-failure";
import { randomUUID } from "crypto";
import { Constants } from "@courselit/common-models";
import type { PaymentPlan } from "@courselit/common-models";
import Membership from "@/models/Membership";
import Invoice from "@/models/Invoice";
import Booking from "@/models/RefundBookingEvidence";
import Intent from "@/models/ClassCheckoutIntent";
import type { InitiateProps } from "@/payments-new/payment";
import {
    ContentChangeError,
    requireCondition,
} from "@/services/content-changes/errors";
import type { BookedClass } from "./types";
import { selectedClass } from "./choices";
import { recordCheckoutReference } from "./reservation";

export async function pendingClassIntent(
    domain: string,
    userId: string,
    courseId: string,
) {
    return Intent.findOne({
        domain,
        userId,
        courseId,
        "state.kind": { $nin: ["completed", "not-started"] },
    }).lean();
}
const pending = (invoiceId: string): never => {
    throw new ContentChangeError(
        "checkout_pending",
        `This checkout is still being confirmed. Check order ${invoiceId} or contact us before trying another payment.`,
        409,
    );
};

/** Caller holds the account and course-checkout reservations through this whole operation. */
export async function initiateClassCheckout(input: {
    domain: string;
    userId: string;
    courseId: string;
    title: string;
    plan: PaymentPlan;
    booking: BookedClass;
    origin: string;
    provider: {
        name: string;
        getCurrencyISOCode(): Promise<string>;
        initiate(input: InitiateProps): Promise<unknown>;
    };
}) {
    const { domain, userId, courseId, booking, plan, provider, origin } = input;
    requireCondition(
        provider.name === "stripe",
        "needs_review",
        "Please contact us to book this class with the current payment connection.",
        409,
    );
    const members = await Membership.find({
        domain,
        userId,
        entityId: courseId,
        entityType: "course",
    }).limit(2);
    requireCondition(
        members.length <= 1,
        "needs_review",
        "Your existing enrollment needs a review before booking.",
        409,
    );
    const member = members[0];
    requireCondition(
        member?.status !== Constants.MembershipStatus.ACTIVE,
        "already_owned",
        "You already have access. To book another class date, contact us before paying.",
        409,
    );
    requireCondition(
        member?.status !== Constants.MembershipStatus.REJECTED,
        "forbidden",
        "This enrollment is unavailable.",
        403,
    );
    const existing = await pendingClassIntent(domain, userId, courseId);
    if (existing) {
        if (
            existing.state.kind === "ready" &&
            existing.booking.fingerprint === booking.fingerprint &&
            existing.planId === plan.planId &&
            member?.sessionId === existing.membershipSessionId
        ) {
            return {
                status: "initiated",
                paymentTracker: existing.state.checkoutUrl,
                metadata: {
                    invoiceId: existing.invoiceId,
                    membershipId: existing.membershipId,
                },
            };
        }
        return pending(existing.invoiceId);
    }
    if (
        member &&
        (await Invoice.exists({
            domain,
            membershipId: member.membershipId,
            status: "pending",
        }))
    )
        throw new ContentChangeError(
            "checkout_pending",
            "An earlier checkout needs confirmation. Contact us before starting another payment.",
            409,
        );
    const currency = await provider.getCurrencyISOCode();
    requireCondition(
        Number.isFinite(plan.oneTimeAmount) && plan.oneTimeAmount! > 0,
        "needs_review",
        "This class price needs a review.",
        409,
    );
    const id = randomUUID(),
        invoiceId = randomUUID(),
        sessionId = randomUUID(),
        membershipId = member?.membershipId || randomUUID();
    await Intent.init();
    let intent;
    try {
        intent = await Intent.create({
            domain,
            id,
            userId,
            courseId,
            planId: plan.planId,
            invoiceId,
            membershipId,
            membershipSessionId: sessionId,
            booking,
            amount: plan.oneTimeAmount,
            currency,
            origin,
            state: { kind: "allocating" },
        });
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        return pending(
            (await pendingClassIntent(domain, userId, courseId))?.invoiceId ||
                id,
        );
    }
    try {
        await recordCheckoutReference(invoiceId);
        if (member) {
            const changed = await Membership.updateOne(
                {
                    _id: member._id,
                    domain,
                    userId,
                    sessionId: member.sessionId,
                    status: member.status,
                },
                {
                    $set: {
                        status: "pending",
                        sessionId,
                        paymentPlanId: plan.planId,
                    },
                    $unset: {
                        accessActivation: 1,
                        subscriptionId: 1,
                        subscriptionMethod: 1,
                    },
                },
            );
            requireCondition(
                changed.matchedCount === 1,
                "conflict",
                "Your enrollment changed. Contact us before paying.",
                409,
            );
        } else {
            await Membership.create({
                domain,
                membershipId,
                userId,
                entityId: courseId,
                entityType: "course",
                status: "pending",
                sessionId,
                paymentPlanId: plan.planId,
            });
        }
        await Invoice.create({
            domain,
            invoiceId,
            membershipId,
            membershipSessionId: sessionId,
            amount: plan.oneTimeAmount,
            currencyISOCode: currency,
            status: "pending",
            paymentProcessor: provider.name,
        });
        await Booking.create({
            domain,
            invoiceId,
            membershipId,
            membershipSessionId: sessionId,
            userId,
            courseId,
            cohortId: booking.cohortId,
            classStart: booking.startAt,
            source: "checkout",
            verifiedBy: userId,
            explanation:
                "The member selected this exact listed class at checkout.",
            verifiedAt: intent.createdAt,
            revision: 0,
            verifications: [],
            checkout: {
                intentId: id,
                cohortDocumentId: booking.cohortDocumentId,
                fingerprint: booking.fingerprint,
                selectedAt: intent.createdAt,
            },
        });
        await selectedClass(domain, courseId, plan.planId, booking);
        const firstAttemptAt = new Date();
        const claimed = await Intent.updateOne(
            { domain, id, "state.kind": "allocating" },
            { $set: { state: { kind: "creating", firstAttemptAt } } },
        );
        requireCondition(
            claimed.modifiedCount === 1,
            "checkout_pending",
            `Checkout needs review. Contact us with order ${invoiceId}.`,
            409,
        );
        const metadata = {
            membershipId,
            invoiceId,
            currencyISOCode: currency,
            classCheckoutId: id,
        };
        const tracker = await provider.initiate({
            metadata,
            paymentPlan: plan,
            product: {
                id: courseId,
                title: `${input.title} — ${new Date(booking.startAt).toISOString().replace("T", " ").replace(".000Z", " UTC")}`,
                type: "course",
            },
            origin,
        });
        requireCondition(
            typeof tracker === "string" &&
                new URL(tracker).origin === "https://checkout.stripe.com",
            "checkout_pending",
            `Checkout needs review. Contact us with order ${invoiceId}.`,
            409,
        );
        const savedInvoice = await Invoice.updateOne(
            { domain, invoiceId, membershipId, membershipSessionId: sessionId },
            { $set: { paymentProcessorEntityId: tracker } },
        );
        requireCondition(
            savedInvoice.matchedCount === 1,
            "checkout_pending",
            `Checkout needs review. Contact us with order ${invoiceId}.`,
            409,
        );
        const savedIntent = await Intent.updateOne(
            { domain, id, "state.kind": "creating" },
            {
                $set: {
                    state: {
                        kind: "ready",
                        firstAttemptAt,
                        checkoutUrl: tracker,
                    },
                },
            },
        );
        requireCondition(
            savedIntent.matchedCount === 1 ||
                (await Intent.exists({
                    domain,
                    id,
                    "state.kind": "completed",
                })),
            "checkout_pending",
            `Checkout needs review. Contact us with order ${invoiceId}.`,
            409,
        );
        return { status: "initiated", paymentTracker: tracker, metadata };
    } catch (error) {
        // No automatic lease expiry/replacement. A timeout can follow a real provider creation.
        const current = await Intent.findOne({ domain, id }).lean();
        if (
            current?.state.kind === "allocating" &&
            (await retireUnstartedAllocation(domain, id))
        ) {
            if (error instanceof ContentChangeError) throw error;
            throw new ContentChangeError(
                "checkout_not_started",
                "Payment did not start. Refresh the class dates before trying again.",
                409,
            );
        }
        if (current?.state.kind === "creating") {
            await Intent.updateOne(
                { domain, id, "state.kind": "creating" },
                {
                    $set: {
                        state: {
                            kind: "uncertain",
                            firstAttemptAt: current.state.firstAttemptAt,
                        },
                    },
                },
            );
        }
        return pending(invoiceId);
    }
}
