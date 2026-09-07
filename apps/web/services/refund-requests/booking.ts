import type GQLContext from "@/models/GQLContext";
import ClassCheckoutIntent from "@/models/ClassCheckoutIntent";
import CohortModel from "@/models/Cohort";
import BookingEvidence from "@/models/RefundBookingEvidence";
import { requireCondition } from "@/services/content-changes/errors";
import { refundReceipt, requireRefundOperator } from "./receipts";

/** Explicit invoice/session association; cohort roster membership alone is never payment evidence. */
export async function verifyRefundClassBooking(
    ctx: GQLContext,
    input: {
        invoiceId: string;
        cohortId: string;
        explanation: string;
        bookingVerified: true;
    },
) {
    requireRefundOperator(ctx);
    const { invoice, membership, course } = await refundReceipt(
        ctx,
        input.invoiceId,
        true,
    );
    requireCondition(
        course && input.bookingVerified === true,
        "bad_request",
        "Review the receipt and its actual class booking.",
    );
    const cohort = await CohortModel.findOne({
        domain: ctx.subdomain._id,
        cohortId: input.cohortId,
        courseId: course.courseId,
        members: membership.userId,
    }).lean();
    const start = cohort?.schedule?.startAt
        ? new Date(cohort.schedule.startAt)
        : null;
    requireCondition(
        cohort && start && Number.isFinite(start.getTime()),
        "needs_review",
        "This class has no verified start or member booking. Review it before applying policy.",
        409,
    );
    const key = { domain: ctx.subdomain._id, invoiceId: invoice.invoiceId };
    await BookingEvidence.init();
    const fields = {
        membershipId: invoice.membershipId,
        membershipSessionId: invoice.membershipSessionId,
        userId: membership.userId,
        courseId: course.courseId,
        cohortId: cohort.cohortId,
        classStart: start,
        source: "operator-verified" as const,
        verifiedBy: ctx.user.userId,
        explanation: input.explanation,
        verifiedAt: new Date(),
    };
    // Association revisions invalidate every previously reviewed consequence snapshot.
    try {
        await BookingEvidence.updateOne(
            key,
            {
                $set: fields,
                $inc: { revision: 1 },
                $push: {
                    verifications: {
                        cohortId: fields.cohortId,
                        classStart: fields.classStart,
                        verifiedBy: fields.verifiedBy,
                        explanation: fields.explanation,
                        verifiedAt: fields.verifiedAt,
                    },
                },
            },
            { upsert: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        throw new Error(
            "Booking changed concurrently. Review the saved association.",
        );
    }
    return {
        kind: "verified" as const,
        invoiceId: invoice.invoiceId,
        classStart: start.toISOString(),
        timeZone: "UTC" as const,
    };
}

export async function readRefundClassEvidence(
    ctx: GQLContext,
    receipt: Awaited<ReturnType<typeof refundReceipt>>,
) {
    const evidence = await BookingEvidence.findOne({
        domain: ctx.subdomain._id,
        invoiceId: receipt.invoice.invoiceId,
    }).lean();
    if (!evidence) return { kind: "none" as const };
    if (evidence.source === "checkout") {
        const intent =
            evidence.checkout &&
            (await ClassCheckoutIntent.findOne({
                domain: ctx.subdomain._id,
                id: evidence.checkout.intentId,
                invoiceId: receipt.invoice.invoiceId,
                userId: receipt.membership.userId,
                membershipId: receipt.invoice.membershipId,
                membershipSessionId: receipt.invoice.membershipSessionId,
                courseId: evidence.courseId,
                "state.kind": "completed",
                "booking.cohortId": evidence.cohortId,
                "booking.cohortDocumentId": evidence.checkout.cohortDocumentId,
                "booking.fingerprint": evidence.checkout.fingerprint,
            }).lean());
        if (
            !intent ||
            receipt.invoice.status !== "paid" ||
            receipt.invoice.settlement?.source !==
                "stripe-checkout-confirmed" ||
            new Date(intent.booking.startAt).getTime() !==
                new Date(evidence.classStart).getTime()
        )
            return { kind: "unknown" as const };
    }
    const cohort = await CohortModel.findOne({
        domain: ctx.subdomain._id,
        ...(evidence.source === "checkout"
            ? { _id: evidence.checkout?.cohortDocumentId }
            : {}),
        cohortId: evidence.cohortId,
        courseId: evidence.courseId,
        members: receipt.membership.userId,
    }).lean();
    const date = cohort?.schedule?.startAt
        ? new Date(cohort.schedule.startAt)
        : null;
    if (
        !receipt.course ||
        evidence.membershipId !== receipt.invoice.membershipId ||
        evidence.membershipSessionId !== receipt.invoice.membershipSessionId ||
        evidence.userId !== receipt.membership.userId ||
        evidence.courseId !== receipt.course.courseId ||
        !date ||
        date.getTime() !== new Date(evidence.classStart).getTime()
    )
        return { kind: "unknown" as const };
    return {
        kind: "verified" as const,
        evidence: {
            cohortId: evidence.cohortId,
            classStart: date,
            revision: evidence.revision,
        },
    };
}
