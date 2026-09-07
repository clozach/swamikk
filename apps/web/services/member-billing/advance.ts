import { Constants, type Membership } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import BillingCancellation from "@/models/BillingCancellation";
import { cancelStripeMonthlySubscription } from "@/payments-new/cancellation";
import { requireCondition } from "@/services/content-changes/errors";
import {
    ownMembership,
    membershipTargets,
    requireBillingMember,
    sameBillingTargets,
    previewConsequences,
} from "./memberships";
import { billingDependencies, type BillingDependencies } from "./provider";
import { cancellationView } from "./projection";
import { claimCancellation, releaseClaim, saveClaimed } from "./claims";
import { freezeBillingRetention, finishBillingRetention } from "./retention";
import { advanceBillingRefund, settledBillingRefund } from "./refund";
import type { MemberBillingCommandResult } from "./types";

export async function advanceMemberCancellation(
    ctx: GQLContext,
    input: {
        action: "confirm" | "reconcile";
        operationId: string;
        quoteHash: string;
    },
    deps: BillingDependencies = billingDependencies,
): Promise<MemberBillingCommandResult> {
    requireBillingMember(ctx, true);
    const scope = {
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        operationId: input.operationId,
    };
    let record = await BillingCancellation.findOne(scope).lean();
    requireCondition(record, "not_found", "Cancellation not found.", 404);
    requireCondition(
        input.quoteHash === record.quote.quoteHash,
        "conflict",
        "The review changed. Read it again before confirming.",
        409,
    );
    const now = deps.now();
    if (record.cancellation.kind === "quoted") {
        requireCondition(
            input.action === "confirm" && record.expiresAt > now,
            "conflict",
            "This review expired. Prepare a new review.",
            409,
        );
        const member = await ownMembership(ctx, record.membershipId);
        requireCondition(
            member.sessionId === record.membershipSessionId &&
                member.subscriptionId === record.quote.subscriptionId &&
                member.subscriptionMethod === "stripe" &&
                member.status === Constants.MembershipStatus.ACTIVE,
            "conflict",
            "The membership changed. Review it again.",
            409,
        );
        const targets = await membershipTargets(ctx, member);
        requireCondition(
            sameBillingTargets(targets, record.targets),
            "conflict",
            "Included access changed. Review it again.",
            409,
        );
        const consequences = await previewConsequences(targets, now);
        requireCondition(
            consequences.kind === "known",
            "needs_review",
            "Access timing changed. Ask for a review before canceling.",
            409,
        );
    }
    if (record.claim && new Date(record.claim.expiresAt) > now)
        return {
            kind: "operation",
            operation: cancellationView(record, false, now),
        };
    if (
        record.cancellation.kind === "canceled" &&
        record.access === "ended" &&
        settledBillingRefund(record.refund)
    )
        return {
            kind: "operation",
            operation: cancellationView(record, false, now),
        };
    // Credentials are resolved from the current tenant; frozen provider IDs remain internal.
    const provider = await deps.provider(ctx, {
        subscriptionId: record.quote.subscriptionId,
        subscriptionMethod: "stripe",
    } as Membership);
    requireCondition(
        provider.livemode === (record.quote.mode === "live"),
        "needs_review",
        "The payment connection changed mode. Ask for a review.",
        409,
    );
    const claim = await claimCancellation(record, now);
    if (!claim) {
        const current = await BillingCancellation.findOne(scope).lean();
        requireCondition(current, "not_found", "Cancellation not found.", 404);
        return {
            kind: "operation",
            operation: cancellationView(current, false, deps.now()),
        };
    }
    record = claim.record;
    try {
        requireCondition(
            record.cancellation.kind !== "quoted",
            "conflict",
            "Cancellation is not confirmed.",
            409,
        );
        const cutoff = new Date(record.cancellation.cutoff);
        if (record.cancellation.kind !== "canceled") {
            const consequences = await freezeBillingRetention(record, cutoff);
            record = await saveClaimed(
                record.operationId,
                claim.id,
                { consequences, access: "capped" },
                deps.now(),
            );
            if (consequences.kind === "partly-unknown") {
                record = await saveClaimed(
                    record.operationId,
                    claim.id,
                    {
                        cancellation: {
                            kind: "review-required",
                            cutoff,
                            reason: "access-timing-unknown",
                        },
                    },
                    deps.now(),
                );
                return {
                    kind: "operation",
                    operation: cancellationView(
                        { ...record, claim: undefined },
                        false,
                        deps.now(),
                    ),
                };
            }
            const canceled = await cancelStripeMonthlySubscription(
                provider.client,
                record.quote,
            );
            if (canceled.kind !== "canceled") {
                record = await saveClaimed(
                    record.operationId,
                    claim.id,
                    {
                        cancellation:
                            canceled.kind === "uncertain"
                                ? { kind: "uncertain", cutoff }
                                : {
                                      kind: "review-required",
                                      cutoff,
                                      reason: canceled.reason,
                                  },
                    },
                    deps.now(),
                );
                return {
                    kind: "operation",
                    operation: cancellationView(
                        { ...record, claim: undefined },
                        false,
                        deps.now(),
                    ),
                };
            }
            record = await saveClaimed(
                record.operationId,
                claim.id,
                {
                    cancellation: {
                        kind: "canceled",
                        cutoff,
                        confirmedAt: deps.now(),
                    },
                },
                deps.now(),
            );
        }
        if (record.access !== "ended") {
            await finishBillingRetention(record);
            record = await saveClaimed(
                record.operationId,
                claim.id,
                { access: "ended" },
                deps.now(),
            );
        }
        record = await advanceBillingRefund(
            record,
            claim.id,
            provider.client,
            deps.now,
        );
        return {
            kind: "operation",
            operation: cancellationView(
                { ...record, claim: undefined },
                false,
                deps.now(),
            ),
        };
    } finally {
        // Failure to release is recoverable after the lease; no financial intent is erased.
        await releaseClaim(record.operationId, claim.id);
    }
}
