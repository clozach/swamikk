import { randomUUID } from "crypto";
import { Constants } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import BillingCancellation from "@/models/BillingCancellation";
import { InvoiceModel } from "./models";
import { prepareStripeMonthlyCancellation } from "@/payments-new/cancellation";
import { requireCondition } from "@/services/content-changes/errors";
import {
    membershipPlan,
    membershipTargets,
    ownMembership,
    previewConsequences,
    requireBillingMember,
} from "./memberships";
import { billingDependencies, type BillingDependencies } from "./provider";
import { cancellationView } from "./projection";
import type { MemberBillingCommandResult } from "./types";

export async function prepareMemberCancellation(
    ctx: GQLContext,
    membershipId: string,
    deps: BillingDependencies = billingDependencies,
): Promise<MemberBillingCommandResult> {
    requireBillingMember(ctx, true);
    const member = await ownMembership(ctx, membershipId);
    requireCondition(
        member.status === Constants.MembershipStatus.ACTIVE,
        "conflict",
        "This membership is not active.",
        409,
    );
    const key = {
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        membershipId,
        membershipSessionId: member.sessionId,
    };
    const existing = await BillingCancellation.findOne(key).lean();
    const now = deps.now();
    if (
        existing &&
        (existing.cancellation.kind !== "quoted" || existing.expiresAt > now)
    )
        return {
            kind: "operation",
            operation: cancellationView(existing, false, now),
        };
    const plan = await membershipPlan(ctx, member);
    if (
        !plan ||
        plan.type !== Constants.PaymentPlanType.SUBSCRIPTION ||
        plan.subscriptionYearlyAmount ||
        member.subscriptionMethod !== "stripe" ||
        !member.subscriptionId
    )
        return { kind: "review-required", reason: "unsupported-plan" };
    const targets = await membershipTargets(ctx, member);
    const consequences = await previewConsequences(targets, now);
    if (consequences.kind === "partly-unknown")
        return { kind: "review-required", reason: "access-timing-unknown" };
    const provider = await deps.provider(ctx, member);
    const mismatchedInvoice = await InvoiceModel.exists({
        domain: ctx.subdomain._id,
        membershipId,
        membershipSessionId: member.sessionId,
        paymentProcessor: "stripe",
        paymentMode: provider.livemode ? "test" : "live",
        status: Constants.InvoiceStatus.PAID,
    });
    if (mismatchedInvoice)
        return { kind: "review-required", reason: "mode-mismatch" };
    const prepared = await prepareStripeMonthlyCancellation(provider.client, {
        subscriptionId: member.subscriptionId,
        paymentPlanType: plan.type,
        expectedLivemode: provider.livemode,
        expectedMembershipId: member.membershipId,
        now,
    });
    if (prepared.kind !== "ready") return prepared;
    // Recheck the native checkout session after provider reads and before storing a quote.
    const current = await ownMembership(ctx, membershipId);
    requireCondition(
        current.sessionId === member.sessionId &&
            current.subscriptionId === member.subscriptionId &&
            current.status === Constants.MembershipStatus.ACTIVE,
        "conflict",
        "The membership changed. Review it again.",
        409,
    );
    const fields = {
        quote: prepared.quote,
        expiresAt: new Date(
            Math.min(
                now.getTime() + 10 * 60000,
                prepared.quote.period.end * 1000,
            ),
        ),
        consequences,
        targets,
        cancellation: { kind: "quoted" as const },
        access: "unchanged" as const,
        refund: { kind: "not-started" as const },
    };
    await BillingCancellation.init();
    if (existing) {
        await BillingCancellation.updateOne(
            {
                ...key,
                revision: existing.revision,
                "cancellation.kind": "quoted",
            },
            { $set: fields, $inc: { revision: 1 } },
        );
    } else {
        try {
            await BillingCancellation.create({
                ...key,
                operationId: randomUUID(),
                ...fields,
                revision: 0,
            });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error;
        }
    }
    const result = await BillingCancellation.findOne(key).lean();
    requireCondition(
        result,
        "unavailable",
        "The cancellation review could not be saved.",
        503,
    );
    return {
        kind: "operation",
        operation: cancellationView(result, false, now),
    };
}
