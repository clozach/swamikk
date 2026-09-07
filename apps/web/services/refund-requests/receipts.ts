import { Constants, UIConstants } from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";
import type GQLContext from "@/models/GQLContext";
import CourseModel from "@/models/Course";
import {
    InvoiceModel,
    MembershipModel,
} from "@/services/member-billing/models";
import { requireCondition } from "@/services/content-changes/errors";

export function requireRefundMember(ctx: GQLContext) {
    requireCondition(
        ctx.user?.active &&
            String(ctx.user.domain) === String(ctx.subdomain._id),
        "unauthorized",
        "Sign in to view your refund requests.",
        401,
    );
}
export function requireRefundOperator(ctx: GQLContext) {
    requireRefundMember(ctx);
    requireCondition(
        !ctx.memberMimic &&
            checkPermission(ctx.user.permissions, [
                UIConstants.permissions.manageSettings,
            ]),
        "forbidden",
        "Payment settings permission is required for refund review.",
        403,
    );
}
export async function refundReceipt(
    ctx: GQLContext,
    invoiceId: string,
    operator = false,
) {
    if (operator) requireRefundOperator(ctx);
    else requireRefundMember(ctx);
    const invoice = await InvoiceModel.findOne({
        domain: ctx.subdomain._id,
        invoiceId,
        status: Constants.InvoiceStatus.PAID,
    }).lean();
    requireCondition(invoice, "not_found", "Paid receipt not found.", 404);
    const membership = await MembershipModel.findOne({
        domain: ctx.subdomain._id,
        membershipId: invoice.membershipId,
        ...(operator ? {} : { userId: ctx.user.userId }),
    }).lean();
    requireCondition(membership, "not_found", "Paid receipt not found.", 404);
    const course =
        membership.entityType === Constants.MembershipEntityType.COURSE
            ? await CourseModel.findOne({
                  domain: ctx.subdomain._id,
                  courseId: membership.entityId,
              })
                  .select("title courseId type")
                  .lean()
            : null;
    return { invoice, membership, course };
}
