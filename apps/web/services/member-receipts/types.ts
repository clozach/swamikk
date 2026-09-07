import type { MemberRefundSummary } from "../../../../packages/common-models/src/stripe-refunds";
export type ReceiptDate =
    | {
          kind: "recorded";
          at: string;
          source: "stripe-invoice-paid" | "stripe-checkout-confirmed";
      }
    | { kind: "unrecorded" };
export interface MemberReceipt {
    refundSummary?: MemberRefundSummary;
    readOnly: boolean;
    invoiceId: string;
    siteName: string;
    productName: string;
    amount: number;
    currency: string;
    mode: "test" | "live" | "unknown";
    settlement: ReceiptDate;
}
