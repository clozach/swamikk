# Read-only native receipts

`GET /api/member-receipts/:invoiceId` returns a paid native invoice only after verifying the authenticated member's tenant and ownership through the invoice's native membership. A later membership session does not erase earlier receipts. Member Mimic resolves the approved subject and remains read-only. The receipt contains a local reference, recorded amount/currency/mode, current product label and the saved settlement evidence; it exposes no provider IDs, credentials, card details or external receipt URL. It performs no payment reconciliation, membership activation, content grant or provider request.

The page `/dashboard/receipts/:invoiceId` is linked from Membership and receipts. It shows test payments explicitly, distinguishes unknown legacy mode/date, and supports browser printing/saving. A receipt records the original payment; later refund status lives with the membership or refund request. It invents no tax breakdown or legal invoice details absent from the native order.

New verified Stripe settlements record one grouped `{at,source}` fact. A renewal uses `status_transitions.paid_at`; a paid Checkout completion uses the signed event's creation time, labelled payment confirmation rather than bank posting. Missing/invalid evidence remains absent. Existing settled records are returned unchanged on duplicate or out-of-order deliveries, including legacy rows. Local creation/update times never substitute for payment dates. Other providers remain unknown until their own verified evidence is integrated.

Primary references: [Stripe Event object](https://docs.stripe.com/api/events/object), [Stripe Invoice object](https://docs.stripe.com/api/invoices/object).

Verify after rebuilding: open a paid receipt from the member profile, compare its amount/mode to the original order, print/save from the visible control, and repeat in read-only Mimic. A foreign member, another tenant, an unpaid order and expired Mimic must receive no receipt body. After rejoining, the earlier paid receipt remains available. The route test compares native records before/after reads to prove no access or payment writes.
