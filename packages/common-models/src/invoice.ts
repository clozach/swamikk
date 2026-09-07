import { Constants } from ".";

const { InvoiceStatus } = Constants;

export type InvoicesStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export interface Invoice {
    invoiceId: string;
    membershipId: string;
    membershipSessionId: string;
    amount: number;
    status: InvoicesStatus;
    paymentProcessor: string;
    paymentProcessorTransactionId?: string;
    paymentProcessorEntityId?: string;
    paymentMode?: "test" | "live";
    /** Provider evidence; absent on older records, never inferred from local creation time. */
    settlement?: {
        at: Date;
        source: "stripe-invoice-paid" | "stripe-checkout-confirmed";
    };
    currencyISOCode: string;
    createdAt?: Date;
    updatedAt?: Date;
}
