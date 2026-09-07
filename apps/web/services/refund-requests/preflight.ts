import type GQLContext from "@/models/GQLContext";
import type { InternalRefundRequest } from "@/models/RefundRequest";
import { requireCondition } from "@/services/content-changes/errors";
import { refundReceipt } from "./receipts";
import { readRefundClassEvidence } from "./booking";
import { purchaseInput, type RefundRequestDependencies } from "./provider";
import { approvedRefundAccessDecision } from "./policy";
import { supportedPurchaseAccessTarget } from "./access";
export async function validateFirstRefundAttempt(
    ctx: GQLContext,
    record: InternalRefundRequest,
    operator: boolean,
    deps: RefundRequestDependencies,
) {
    requireCondition(
        await supportedPurchaseAccessTarget(
            String(record.domain),
            record.invoiceId,
            record.membershipId,
            record.membershipSessionId,
        ),
        "needs_review",
        "This payment’s access association needs review before money can be sent.",
        409,
    );
    requireCondition(
        record.accessDecision === approvedRefundAccessDecision,
        "needs_review",
        "The access policy changed. Review the consequences again.",
        409,
    );

    requireCondition(
        record.quoteExpiresAt && record.quoteExpiresAt > deps.now(),
        "needs_review",
        "The approved payment review expired before its first attempt.",
        409,
    );
    const receipt = await refundReceipt(ctx, record.invoiceId, operator);
    const payment = purchaseInput(receipt);
    const frozenQuote = record.quote;
    requireCondition(
        payment &&
            Object.entries(payment).every(
                ([key, value]) =>
                    frozenQuote?.[key as keyof typeof payment] === value,
            ),
        "needs_review",
        "The original payment record changed. Review its evidence before applying the refund.",
        409,
    );
    const evidence = await readRefundClassEvidence(ctx, receipt);
    requireCondition(
        record.classEvidence
            ? evidence.kind === "verified" &&
                  evidence.evidence.revision ===
                      record.classEvidence.revision &&
                  evidence.evidence.classStart.getTime() ===
                      new Date(record.classEvidence.classStart).getTime()
            : evidence.kind === "none",
        "needs_review",
        "The verified class booking changed. Review the consequences again.",
        409,
    );
}
