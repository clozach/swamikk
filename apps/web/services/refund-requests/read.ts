import {
    readRefundProjection,
    refundSummaryFor,
    withObservedRefund,
} from "@/payments-new/stripe-lifecycle/refund-projection";
import type GQLContext from "@/models/GQLContext";
import { Constants } from "@courselit/common-models";
import {
    InvoiceModel,
    MembershipModel,
} from "@/services/member-billing/models";
import RefundRequest from "@/models/RefundRequest";
import CourseModel from "@/models/Course";
import CohortModel from "@/models/Cohort";
import {
    requireRefundMember,
    requireRefundOperator,
    refundReceipt,
} from "./receipts";
import { refundRequestView } from "./projection";
import type {
    MemberRefundRequestsView,
    OperatorRefundRequestsView,
} from "./types";

export async function readMemberRefundRequests(
    ctx: GQLContext,
): Promise<MemberRefundRequestsView> {
    requireRefundMember(ctx);
    const memberships = await MembershipModel.find({
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        isIncludedInPlan: { $ne: true },
    }).lean();
    const invoices = await InvoiceModel.find({
        domain: ctx.subdomain._id,
        membershipId: { $in: memberships.map((member) => member.membershipId) },
        status: Constants.InvoiceStatus.PAID,
    })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    const requests = await RefundRequest.find({
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        ...(ctx.memberMimic ? { state: { $ne: "draft" } } : {}),
    }).lean();
    const products: MemberRefundRequestsView["products"] = [];
    const projection = await readRefundProjection(String(ctx.subdomain._id), [
        ctx.user.userId,
    ]);
    const refunds = projection.evidence;
    for (const invoice of invoices) {
        const member = memberships.find(
            (item) => item.membershipId === invoice.membershipId,
        )!;
        const request = requests.find(
            (item) => item.invoiceId === invoice.invoiceId,
        );
        const course =
            member.entityType === Constants.MembershipEntityType.COURSE
                ? await CourseModel.findOne({
                      domain: ctx.subdomain._id,
                      courseId: member.entityId,
                  })
                      .select("title")
                      .lean()
                : null;
        products.push({
            invoiceId: invoice.invoiceId,
            refundSummary: refundSummaryFor(projection, {
                ...invoice,
                userId: ctx.user.userId,
            }),
            productName:
                request?.productName ||
                course?.title ||
                "Membership / purchase",
            amount: invoice.amount,
            currency: invoice.currencyISOCode,
            mode: invoice.paymentMode || "unknown",
            request: request
                ? refundRequestView(withObservedRefund(request, refunds), {
                      readOnly: !!ctx.memberMimic,
                  })
                : null,
            receiptHref: `/dashboard/receipts/${encodeURIComponent(invoice.invoiceId)}`,
        });
    }
    return {
        readOnly: !!ctx.memberMimic,
        products,
        membershipHref: "/dashboard/membership",
    };
}
export async function readOperatorRefundRequests(
    ctx: GQLContext,
): Promise<OperatorRefundRequestsView> {
    requireRefundOperator(ctx);
    const records = await RefundRequest.find({
        domain: ctx.subdomain._id,
        state: { $ne: "draft" },
    })
        .sort({ submittedAt: 1 })
        .limit(100)
        .lean();
    const projection = await readRefundProjection(
        String(ctx.subdomain._id),
        records.map((item) => item.userId),
    );
    const currentEvidence = projection.evidence;
    return {
        requests: records.map((record) => ({
            ...refundRequestView(withObservedRefund(record, currentEvidence), {
                operator: true,
            }),
            refundSummary: refundSummaryFor(projection, record),
        })),
    };
}
export async function refundBookingChoices(ctx: GQLContext, invoiceId: string) {
    requireRefundOperator(ctx);
    const receipt = await refundReceipt(ctx, invoiceId, true);
    const choices = receipt.course
        ? await CohortModel.find({
              domain: ctx.subdomain._id,
              courseId: receipt.course.courseId,
              members: receipt.membership.userId,
          })
              .select("cohortId name schedule")
              .lean()
        : [];
    return {
        invoiceId,
        choices: choices.map((cohort) => ({
            cohortId: cohort.cohortId,
            name: cohort.name,
            startAt: cohort.schedule?.startAt
                ? new Date(cohort.schedule.startAt).toISOString()
                : null,
            timeZone: "UTC",
        })),
    };
}
