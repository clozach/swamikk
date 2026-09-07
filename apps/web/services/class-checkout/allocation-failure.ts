import Intent from "@/models/ClassCheckoutIntent";
import { InvoiceModel as Invoice } from "@/services/member-billing/models";

/** Only allocating proves that no worker has permission to contact the provider. */
export async function retireUnstartedAllocation(domain: string, id: string) {
    const intent = await Intent.findOneAndUpdate(
        { domain, id, "state.kind": "allocating" },
        {
            $set: {
                state: { kind: "allocation-failed", failedAt: new Date() },
            },
        },
        { new: true },
    ).lean();
    if (!intent) return false;
    const key = {
        domain,
        invoiceId: intent.invoiceId,
        membershipId: intent.membershipId,
        membershipSessionId: intent.membershipSessionId,
    };
    const invoice = await Invoice.findOne(key).lean();
    if (invoice) {
        const retired = await Invoice.updateOne(
            {
                ...key,
                status: "pending",
                paymentProcessorTransactionId: { $exists: false },
                paymentProcessorEntityId: { $exists: false },
                settlement: { $exists: false },
            },
            { $set: { status: "failed" } },
        );
        if (retired.matchedCount !== 1) return false;
    }
    const retired = await Intent.updateOne(
        { domain, id, "state.kind": "allocation-failed" },
        { $set: { state: { kind: "not-started", retiredAt: new Date() } } },
    );
    return retired.matchedCount === 1;
}
