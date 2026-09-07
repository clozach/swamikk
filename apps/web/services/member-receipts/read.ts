import { Constants } from "@courselit/common-models";
import type { Invoice } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import CourseModel from "@/models/Course";
import CommunityModel from "@/models/Community";
import {
    InvoiceModel,
    MembershipModel,
} from "@/services/member-billing/models";
import { requireBillingMember } from "@/services/member-billing/memberships";
import { requireCondition } from "@/services/content-changes/errors";
import type { MemberReceipt, ReceiptDate } from "./types";

export function receiptDate(invoice: Pick<Invoice, "settlement">): ReceiptDate {
    const evidence = invoice.settlement;
    if (
        !evidence?.at ||
        !["stripe-invoice-paid", "stripe-checkout-confirmed"].includes(
            evidence.source,
        )
    )
        return { kind: "unrecorded" };
    const at = new Date(evidence.at);
    return Number.isFinite(at.getTime())
        ? { kind: "recorded", at: at.toISOString(), source: evidence.source }
        : { kind: "unrecorded" };
}

/** A receipt read does not reconcile payment, activate access or contact a provider. */
export async function readMemberReceipt(
    ctx: GQLContext,
    invoiceId: string,
): Promise<MemberReceipt> {
    requireBillingMember(ctx);
    const invoice = await InvoiceModel.findOne({
        domain: ctx.subdomain._id,
        invoiceId,
        status: Constants.InvoiceStatus.PAID,
    }).lean();
    requireCondition(invoice, "not_found", "Receipt not found.", 404);
    // Session equality is deliberately absent: the member keeps receipts after rejoining.
    const member = await MembershipModel.findOne({
        domain: ctx.subdomain._id,
        membershipId: invoice.membershipId,
        userId: ctx.user.userId,
    }).lean();
    requireCondition(member, "not_found", "Receipt not found.", 404);
    const product =
        member.entityType === Constants.MembershipEntityType.COURSE
            ? await CourseModel.findOne({
                  domain: ctx.subdomain._id,
                  courseId: member.entityId,
              })
                  .select("title")
                  .lean()
            : await CommunityModel.findOne({
                  domain: ctx.subdomain._id,
                  communityId: member.entityId,
              })
                  .select("name")
                  .lean();
    return {
        readOnly: !!ctx.memberMimic,
        invoiceId: invoice.invoiceId,
        siteName: ctx.subdomain.settings?.title || "Membership",
        productName:
            (product && ("title" in product ? product.title : product.name)) ||
            "Purchased item",
        amount: invoice.amount,
        currency: invoice.currencyISOCode,
        mode: invoice.paymentMode || "unknown",
        settlement: receiptDate(invoice),
    };
}
