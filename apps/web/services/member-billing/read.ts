import {
    readRefundProjection,
    refundSummaryFor,
    withObservedRefund,
} from "@/payments-new/stripe-lifecycle/refund-projection";
import { Constants, type Membership } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import { MembershipModel, InvoiceModel } from "./models";
import CourseModel from "@/models/Course";
import CommunityModel from "@/models/Community";
import BillingCancellation from "@/models/BillingCancellation";
import {
    requireBillingMember,
    membershipPlan,
    membershipTargets,
    previewConsequences,
} from "./memberships";
import { cancellationView } from "./projection";
import { receiptDate } from "@/services/member-receipts/read";
import type { BillingMembershipView, MemberBillingView } from "./types";

export async function readMemberBilling(
    ctx: GQLContext,
): Promise<MemberBillingView> {
    requireBillingMember(ctx);
    const memberships: Membership[] = await MembershipModel.find({
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        isIncludedInPlan: { $ne: true },
    })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    const views: BillingMembershipView[] = [];
    const projection = await readRefundProjection(String(ctx.subdomain._id), [
        ctx.user.userId,
    ]);
    const refunds = projection.evidence;
    for (const member of memberships) {
        const [plan, product, invoices, operation, targets] = await Promise.all(
            [
                membershipPlan(ctx, member),
                member.entityType === Constants.MembershipEntityType.COURSE
                    ? CourseModel.findOne({
                          domain: ctx.subdomain._id,
                          courseId: member.entityId,
                      })
                          .select("title")
                          .lean()
                    : CommunityModel.findOne({
                          domain: ctx.subdomain._id,
                          communityId: member.entityId,
                      })
                          .select("name")
                          .lean(),
                InvoiceModel.find({
                    domain: ctx.subdomain._id,
                    membershipId: member.membershipId,
                    status: Constants.InvoiceStatus.PAID,
                })
                    .sort({ createdAt: -1 })
                    .limit(50)
                    .lean(),
                BillingCancellation.findOne({
                    domain: ctx.subdomain._id,
                    userId: ctx.user.userId,
                    membershipId: member.membershipId,
                    membershipSessionId: member.sessionId,
                }).lean(),
                membershipTargets(ctx, member),
            ],
        );
        const consequences =
            operation?.cancellation.kind !== "quoted" && operation
                ? operation.consequences
                : await previewConsequences(targets);
        let eligibility: BillingMembershipView["cancellationEligibility"] = {
            kind: "available",
        };
        if (member.status !== Constants.MembershipStatus.ACTIVE)
            eligibility = {
                kind: "unavailable",
                reason: "membership-not-active",
            };
        else if (
            !plan ||
            plan.type !== Constants.PaymentPlanType.SUBSCRIPTION ||
            plan.subscriptionYearlyAmount ||
            member.subscriptionMethod !== "stripe" ||
            !member.subscriptionId
        )
            eligibility = {
                kind: "review-required",
                reason: "unsupported-plan",
            };
        else if (consequences.kind === "partly-unknown")
            eligibility = {
                kind: "review-required",
                reason: "access-timing-unknown",
            };
        views.push({
            membershipId: member.membershipId,
            productName:
                (product &&
                    ("title" in product ? product.title : product.name)) ||
                "Membership",
            planName: plan?.name || "Plan unavailable",
            status: member.status,
            planType: plan?.type || "unknown",
            consequences,
            cancellationEligibility: eligibility,
            cancellation: operation
                ? cancellationView(
                      withObservedRefund(operation, refunds),
                      !!ctx.memberMimic,
                  )
                : null,
            invoices: invoices.map((invoice) => ({
                invoiceId: invoice.invoiceId,
                refundSummary: refundSummaryFor(projection, {
                    ...invoice,
                    userId: ctx.user.userId,
                }),
                amount: invoice.amount,
                currency: invoice.currencyISOCode,
                mode: invoice.paymentMode || "unknown",
                status: invoice.status,
                paidAt:
                    receiptDate(invoice).kind === "recorded"
                        ? new Date(invoice.settlement!.at).toISOString()
                        : null,
                receipt: {
                    kind: "available" as const,
                    href: `/dashboard/receipts/${encodeURIComponent(invoice.invoiceId)}`,
                },
            })),
        });
    }
    return { readOnly: !!ctx.memberMimic, memberships: views };
}
