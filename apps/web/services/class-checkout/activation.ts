import { classFingerprint } from "./choices";
import Intent from "@/models/ClassCheckoutIntent";
import { InvoiceModel as Invoice } from "@/services/member-billing/models";
import Membership from "@/models/Membership";
import Cohort from "@/models/Cohort";
import User from "@/models/User";
import Booking from "@/models/RefundBookingEvidence";
import { requireCondition } from "@/services/content-changes/errors";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";

/** Exact paid-session follow-up only; normal enrollments without a class intent are untouched. */
export async function completeClassBooking(
    domain: string,
    userId: string,
    membershipId: string,
    sessionId: string,
) {
    const intent = await Intent.findOne({
        domain,
        userId,
        membershipId,
        membershipSessionId: sessionId,
    }).lean();
    if (!intent) return;
    return withAccountWrite(
        { domainId: domain, userId, purpose: "paid-class-booking" },
        async () => {
            const [member, invoice, evidence] = await Promise.all([
                Membership.findOne({
                    domain,
                    userId,
                    membershipId,
                    sessionId,
                    status: "active",
                    entityId: intent.courseId,
                    paymentPlanId: intent.planId,
                }).lean(),
                Invoice.findOne({
                    domain,
                    invoiceId: intent.invoiceId,
                    membershipId,
                    membershipSessionId: sessionId,
                    status: "paid",
                    paymentProcessor: "stripe",
                }).lean(),
                Booking.findOne({
                    domain,
                    invoiceId: intent.invoiceId,
                    "checkout.intentId": intent.id,
                    source: "checkout",
                }).lean(),
            ]);
            requireCondition(
                member &&
                    invoice &&
                    evidence &&
                    Number.isFinite(invoice.amount) &&
                    invoice.amount >= 0 &&
                    invoice.amount <= intent.amount &&
                    invoice.currencyISOCode.toLowerCase() ===
                        intent.currency.toLowerCase() &&
                    invoice.paymentProcessorTransactionId &&
                    invoice.paymentMode &&
                    ["test", "live"].includes(invoice.paymentMode) &&
                    invoice.settlement?.source ===
                        "stripe-checkout-confirmed" &&
                    evidence.userId === userId &&
                    evidence.courseId === intent.courseId &&
                    evidence.membershipId === membershipId &&
                    evidence.membershipSessionId === sessionId &&
                    evidence.checkout?.fingerprint ===
                        intent.booking.fingerprint &&
                    evidence.checkout?.cohortDocumentId ===
                        intent.booking.cohortDocumentId &&
                    evidence.cohortId === intent.booking.cohortId &&
                    new Date(evidence.classStart).getTime() ===
                        new Date(intent.booking.startAt).getTime() &&
                    ["creating", "ready", "uncertain", "completed"].includes(
                        intent.state.kind,
                    ),
                "class_booking_pending",
                `Class booking needs confirmation. Contact us with order ${intent.invoiceId}.`,
                409,
            );
            if (intent.state.kind === "completed") return;
            const current = await Cohort.findOne({
                _id: intent.booking.cohortDocumentId,
                domain,
                courseId: intent.courseId,
                cohortId: intent.booking.cohortId,
            }).lean();
            requireCondition(
                current &&
                    classFingerprint(current) === intent.booking.fingerprint,
                "class_booking_pending",
                `The booked date or listing changed. Contact us with order ${intent.invoiceId}.`,
                409,
            );
            const enrolled = await Cohort.updateOne(
                {
                    _id: intent.booking.cohortDocumentId,
                    domain,
                    courseId: intent.courseId,
                    cohortId: intent.booking.cohortId,
                    checkoutState: "listed-open",
                    checkoutRevision: intent.booking.revision,
                    name: intent.booking.name,
                    "schedule.startAt": intent.booking.startAt,
                },
                { $addToSet: { members: userId } },
            );
            requireCondition(
                enrolled.matchedCount === 1,
                "class_booking_pending",
                `The booked class needs review. Contact us with order ${intent.invoiceId}.`,
                409,
            );
            const user = await User.updateOne(
                { domain, userId, active: true },
                { $addToSet: { tags: `cohort:${intent.booking.cohortId}` } },
            );
            requireCondition(
                user.matchedCount === 1,
                "account_unavailable",
                "This member is unavailable.",
                409,
            );
            await Intent.updateOne(
                { domain, id: intent.id, "state.kind": { $ne: "completed" } },
                {
                    $set: {
                        state: {
                            kind: "completed",
                            paidAt: invoice.settlement.at,
                        },
                    },
                },
            );
        },
    );
}
