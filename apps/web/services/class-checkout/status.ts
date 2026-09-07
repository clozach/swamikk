import {
    InvoiceModel as Invoice,
    MembershipModel as Membership,
} from "@/services/member-billing/models";
import Intent, {
    type InternalClassCheckoutIntent,
} from "@/models/ClassCheckoutIntent";
import Cohort from "@/models/Cohort";
import { CheckoutReservation } from "./reservation";
import { classFingerprint } from "./choices";
import type { ClassChoice } from "./types";
export type ClassCheckoutStatus =
    | { kind: "none" }
    | { kind: "pending"; reference: string }
    | {
          kind: "paid-review";
          reference: string;
          selectedStart: string;
          membership: "active" | "unconfirmed";
      }
    | { kind: "ready"; reference: string; planId: string; choice: ClassChoice }
    | { kind: "completed"; reference: string; selectedStart: string };

async function intentStatus(
    intent: InternalClassCheckoutIntent | null,
): Promise<ClassCheckoutStatus> {
    if (!intent || intent.state.kind === "not-started") return { kind: "none" };
    const selectedStart = new Date(intent.booking.startAt).toISOString();
    if (intent.state.kind === "completed")
        return {
            kind: "completed",
            reference: intent.invoiceId,
            selectedStart,
        };
    const domain = String(intent.domain);
    if (
        await Invoice.exists({
            domain,
            invoiceId: intent.invoiceId,
            membershipId: intent.membershipId,
            membershipSessionId: intent.membershipSessionId,
            status: "paid",
        })
    ) {
        const active = await Membership.exists({
            domain,
            userId: intent.userId,
            membershipId: intent.membershipId,
            sessionId: intent.membershipSessionId,
            status: "active",
        });
        return {
            kind: "paid-review",
            reference: intent.invoiceId,
            selectedStart,
            membership: active ? "active" : "unconfirmed",
        };
    }
    const current = await Cohort.findOne({
        domain,
        _id: intent.booking.cohortDocumentId,
        cohortId: intent.booking.cohortId,
    }).lean();
    if (
        intent.state.kind === "ready" &&
        current?.checkoutState === "listed-open" &&
        current.schedule?.startAt &&
        new Date(current.schedule.startAt) > new Date() &&
        classFingerprint(current) === intent.booking.fingerprint
    )
        return {
            kind: "ready",
            reference: intent.invoiceId,
            planId: intent.planId,
            choice: {
                cohortId: intent.booking.cohortId,
                fingerprint: intent.booking.fingerprint,
            },
        };
    return { kind: "pending", reference: intent.invoiceId };
}
/** Caller authenticates the current owner. An exact receipt never switches to the latest course order. */
export async function classInvoiceStatus(
    domain: string,
    userId: string,
    invoiceId: string,
): Promise<ClassCheckoutStatus> {
    return intentStatus(
        await Intent.findOne({ domain, userId, invoiceId }).lean(),
    );
}
export async function classCheckoutStatus(
    domain: string,
    userId: string,
    courseId: string,
): Promise<ClassCheckoutStatus> {
    const status = await intentStatus(
        await Intent.findOne({ domain, userId, courseId })
            .sort({ createdAt: -1 })
            .lean(),
    );
    if (status.kind === "paid-review" || status.kind === "completed")
        return status;
    const held = await CheckoutReservation.findOne({
        domain,
        userId,
        courseId,
        "state.kind": "held",
    }).lean();
    if (held?.state.kind === "held")
        return {
            kind: "pending",
            reference: held.state.invoiceId || held.state.id,
        };
    return status;
}
