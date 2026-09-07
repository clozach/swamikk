import type { MembershipAccessKey } from "../../../common-models/src/member-access";
import type {
    FullPurchaseRefundProof,
    PurchaseAccessResult,
} from "../../../common-models/src/purchase-access";
import { PurchaseAccessModel } from "./model";
import { initializePurchaseAccess, purchaseAccessKey } from "./gate";
import {
    AccessMembershipModel,
    MembershipAccessModel,
} from "../member-access/models";
import { accessAssert } from "../member-access/errors";

async function capPeriod(
    key: MembershipAccessKey,
    proof: FullPurchaseRefundProof,
) {
    // Same period revision boundary as drip release/delivery claims. Sent or
    // dispatching mail is never described as retracted.
    for (let attempt = 0; attempt < 8; attempt++) {
        const period = await MembershipAccessModel.findOne(
            purchaseAccessKey(key),
        ).lean();
        if (!period) return;
        const operationId = `full-refund:${proof.invoiceId}`;
        if (
            period.state.kind === "ended" &&
            period.state.operationId === operationId
        )
            return;
        const at = new Date();
        const result = await MembershipAccessModel.updateOne(
            { _id: period._id, revision: period.revision },
            {
                $set: {
                    state: ["ended", "prepared"].includes(period.state.kind)
                        ? period.state
                        : {
                              kind: "ended",
                              operationId,
                              endedAt: at,
                              snapshot: {
                                  cutoff: at,
                                  visibleLessonIds: [],
                                  retainedLessonIds: [],
                                  unknownReleaseCount: 0,
                              },
                          },
                    deliveries: period.deliveries.map((delivery) =>
                        delivery.state.kind === "pending"
                            ? { ...delivery, state: { kind: "cancelled", at } }
                            : delivery,
                    ),
                    updatedAt: at,
                },
                $inc: { revision: 1 },
            },
        );
        if (result.modifiedCount) return;
    }
    throw new Error(
        "Purchase access changed repeatedly; reconcile the refund again.",
    );
}

/** Caller must already have complete current provider proof and an account-write reservation. */
export async function endFullyRefundedPurchase(
    key: MembershipAccessKey,
    proof: FullPurchaseRefundProof,
    reviewBooking: () => Promise<boolean>,
): Promise<PurchaseAccessResult> {
    accessAssert(
        Number.isSafeInteger(proof.paidAmount) &&
            proof.paidAmount > 0 &&
            proof.refundIds.length > 0 &&
            new Set(proof.refundIds).size === proof.refundIds.length,
        "invalid",
        "Complete refund evidence is required.",
    );
    await initializePurchaseAccess(key);
    await PurchaseAccessModel.updateOne(
        { ...purchaseAccessKey(key), state: "open" },
        { $set: { state: "ending", proof, updatedAt: new Date() } },
    );
    const record = await PurchaseAccessModel.findOne(
        purchaseAccessKey(key),
    ).lean();
    accessAssert(
        record?.proof?.invoiceId === proof.invoiceId &&
            record.proof.chargeId === proof.chargeId &&
            record.proof.mode === proof.mode &&
            record.proof.paidAmount === proof.paidAmount &&
            record.proof.currency === proof.currency,
        "conflict",
        "The refunded purchase evidence changed. Review it before continuing.",
    );
    if (record.state === "ended")
        return record.bookingReviewRequired ? "ended-booking-review" : "ended";
    await capPeriod(key, record.proof);
    if (record.writes.length) return "pending";
    // No later callback may be admitted after announcement. Historical sessions
    // are durable, but cannot expire a newer rejoin on the same membership row.
    await AccessMembershipModel.updateOne(
        {
            domain: key.domainId,
            userId: key.userId,
            membershipId: key.membershipId,
            sessionId: key.membershipSessionId,
            entityId: key.courseId,
            entityType: "course",
            status: { $in: ["active", "pending"] },
        },
        { $set: { status: "expired" } },
    );
    const bookingReviewRequired = await reviewBooking();
    await PurchaseAccessModel.updateOne(
        { ...purchaseAccessKey(key), state: "ending", writes: { $size: 0 } },
        {
            $set: {
                state: "ended",
                bookingReviewRequired,
                endedAt: new Date(),
                updatedAt: new Date(),
            },
        },
    );
    return bookingReviewRequired ? "ended-booking-review" : "ended";
}
