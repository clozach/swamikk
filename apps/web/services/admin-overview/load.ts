import Course from "@/models/Course";
import Invoice from "@/models/Invoice";
import Membership from "@/models/Membership";
import Binding from "@/models/StripeSubscriptionBinding";
import Refunds from "@/models/StripeChargeRefunds";
import Cancellation from "@/models/BillingCancellation";
import RefundRequest from "@/models/RefundRequest";
import Webhook from "@/models/StripeWebhookReceipt";
import { ContentChangeModel, FeedbackModel } from "../content-changes/models";
import { DripChangeModel } from "../drip-admin/models";
import { MembershipAccessModel } from "../../../../packages/common-logic/src/member-access/models";
import { Constants } from "@courselit/common-models";
import type {
    Invoice as InvoiceRecord,
    Membership as MembershipRecord,
    MembershipAccessPeriod,
    StripeSubscriptionBinding,
    StripeWebhookReceipt,
    ContextualFeedback,
    ContentChange,
    DripChange,
} from "@courselit/common-models";
import type { InternalBillingCancellation } from "@/models/BillingCancellation";
import type { InternalRefundRequest } from "@/models/RefundRequest";
import type { InternalStripeChargeRefunds } from "../../../../packages/orm-models/src/models/stripe-refunds";
import { scan } from "./records";
import type { SourceCoverage } from "./types";

export async function loadOverview(domain: unknown, from: Date) {
    const scope = { domain };
    const [
        payments,
        memberships,
        access,
        subscriptions,
        refunds,
        cancellations,
        requests,
        webhooks,
        changes,
        releases,
        feedback,
        products,
    ] = await Promise.all([
        scan<InvoiceRecord>(
            "payments",
            Invoice,
            {
                ...scope,
                status: Constants.InvoiceStatus.PAID,
                paymentProcessor: { $ne: "synthetic" },
                $or: [
                    { "settlement.at": { $gte: from } },
                    {
                        "settlement.at": null,
                        createdAt: { $gte: from },
                    },
                ],
            },
            "invoiceId membershipId membershipSessionId amount currencyISOCode paymentMode settlement createdAt updatedAt",
        ),
        scan<MembershipRecord>(
            "memberships",
            Membership,
            { ...scope, entityType: Constants.MembershipEntityType.COURSE },
            "membershipId userId entityId entityType status sessionId paymentPlanId isIncludedInPlan createdAt updatedAt",
        ),
        scan<MembershipAccessPeriod>(
            "access",
            MembershipAccessModel,
            scope,
            "id userId courseId membershipId membershipSessionId state createdAt updatedAt",
        ),
        scan<StripeSubscriptionBinding>(
            "subscriptions",
            Binding,
            scope,
            "subscriptionId membershipId membershipSessionId userId includedMembershipIds state mode updatedAt createdAt",
        ),
        scan<InternalStripeChargeRefunds>(
            "refunds",
            Refunds,
            scope,
            "domain chargeId invoiceId membershipId membershipSessionId userId currency mode state claim revision updatedAt createdAt",
        ),
        scan<InternalBillingCancellation>(
            "cancellations",
            Cancellation,
            scope,
            "domain userId operationId membershipId membershipSessionId quote cancellation refund claim access revision updatedAt createdAt",
        ),
        scan<InternalRefundRequest>(
            "refund-requests",
            RefundRequest,
            scope,
            "domain userId requestId invoiceId membershipId membershipSessionId state quote refund claim access revision updatedAt createdAt",
        ),
        scan<StripeWebhookReceipt>(
            "webhooks",
            Webhook,
            { ...scope, "state.kind": { $ne: "complete" } },
            "eventId type state mode updatedAt createdAt",
        ),
        scan<ContentChange>(
            "content-changes",
            ContentChangeModel,
            {
                ...scope,
                "state.kind": { $in: ["failed", "uncertain", "applying"] },
            },
            "id state updatedAt createdAt",
        ),
        scan<DripChange>(
            "release-changes",
            DripChangeModel,
            { ...scope, "state.kind": { $in: ["uncertain", "applying"] } },
            "id state updatedAt createdAt",
        ),
        scan<ContextualFeedback>(
            "feedback-mail",
            FeedbackModel,
            {
                ...scope,
                "notification.kind": {
                    $in: ["failed", "uncertain", "sending"],
                },
            },
            "id notification updatedAt createdAt",
        ),
        countProducts(domain),
    ]);
    return {
        payments,
        memberships,
        access,
        subscriptions,
        refunds,
        cancellations,
        requests,
        webhooks,
        changes,
        releases,
        feedback,
        products,
    };
}
async function countProducts(
    domain: unknown,
): Promise<{ count: number | null; coverage: SourceCoverage }> {
    try {
        const [count, latest] = await Promise.all([
            Course.countDocuments({
                domain,
                published: true,
                type: {
                    $in: [
                        Constants.CourseType.COURSE,
                        Constants.CourseType.DOWNLOAD,
                    ],
                },
            }),
            Course.findOne({
                domain,
                published: true,
                type: {
                    $in: [
                        Constants.CourseType.COURSE,
                        Constants.CourseType.DOWNLOAD,
                    ],
                },
            })
                .select("updatedAt")
                .sort({ updatedAt: -1 })
                .lean(),
        ]);
        return {
            count,
            coverage: {
                source: "products",
                state: "available",
                loaded: count,
                limited: false,
                latestRecordAt: latest?.updatedAt?.toISOString() || null,
            },
        };
    } catch {
        return {
            count: null,
            coverage: {
                source: "products",
                state: "unavailable",
                loaded: 0,
                limited: false,
                latestRecordAt: null,
            },
        };
    }
}
export type OverviewRecords = Awaited<ReturnType<typeof loadOverview>>;
