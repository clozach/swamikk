import Ledger from "@/models/StripeChargeRefunds";
import Binding from "@/models/StripeSubscriptionBinding";
import Receipt from "@/models/StripeWebhookReceipt";

/** Maintenance-only tenant purge, after its webhook/queue writers and provider forwarding stop. */
export async function deleteTenantStripeLifecycle(
    domainId: string,
): Promise<void> {
    await Binding.deleteMany({ domain: domainId });
    await Ledger.deleteMany({ domain: domainId });
    await Receipt.deleteMany({ domain: domainId });
}
