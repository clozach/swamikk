# Stripe receipt reconciliation

Stripe Checkout remains a hosted redirect. New subscription sessions copy the current order and membership identifiers into `subscription_data.metadata`, so renewal invoices keep their association with the original order. The webhook recognizes both older `subscription_details` and newer `parent.subscription_details` invoice payloads. Older subscriptions without metadata resolve through the tenant's saved subscription ID and current membership session.

The signing secret is required. Missing configuration returns 503 without touching invoices or memberships; invalid signatures return 400. No unsigned compatibility path remains. Only completed paid checkout sessions and paid renewal invoices are handled in this increment. Cancellation, refund-state reconciliation and the member billing controls remain separate MVP work.

Initial delivery settles the existing pending order atomically. A renewal uses a deterministic invoice ID keyed to tenant and Stripe invoice, protected by the existing unique invoice-ID index. Concurrent deliveries, retries and historical renewals already recorded with generated IDs do not create extra invoices. An earlier membership session, another tenant, a mismatched currency or a different payment settling the same checkout is rejected. The amount comes from the settled Stripe object, including discounts, rather than the current plan price. A saved test/live mode labels renewal transactions correctly even though an invoice ID has no `cs_test_` prefix.

For subscription payments, current provider status is checked before activation, preventing a late payment event from activating an already-cancelled subscription. This check does not itself remove older local grants; the member-access/cancellation integration owns that transition. Storage or provider errors remain retryable; recording an invoice is not treated as proof that membership post-processing completed.

## Verification

Focused API tests use actual isolated Mongo invoices and concurrent deliveries. They cover one initial receipt, one renewal across eight concurrent requests, historical receipt deduplication, tenant/currency/session mismatch, actual discounted amounts, test labels, metadata shapes and Stripe charge units. Signature tests verify valid, tampered, wrong-key, absent-signature and absent-configuration requests. No Stripe account or running site is changed by these tests.

Runtime proof after rollout: complete a Stripe sandbox checkout, resend its webhook, and confirm a single receipt; deliver a renewal twice and confirm one additional transaction marked Test. Then verify that a missing signing secret cannot change access. Cancellation/refund acceptance is tracked in the project delivery record until its separate implementation lands.

References reviewed September 6, 2026: [webhook duplicates and ordering](https://docs.stripe.com/webhooks), [subscription metadata](https://docs.stripe.com/metadata), [invoice representation](https://docs.stripe.com/api/invoices/object), and [Stripe charge currency units](https://docs.stripe.com/currencies).
