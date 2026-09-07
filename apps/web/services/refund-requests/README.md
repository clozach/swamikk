# Purchase and class refund requests

Al approved the current policy on September 7: full cumulative successful purchase/class refunds end only that payment’s access; partial refunds keep access. Monthly cancellation/retained-drop rules are unchanged. The original receipt amount, booking evidence and each approved refund attempt stay on record.

The operator can review an exact partial amount in the payment currency. The strict API uses integer Stripe charge units. Editing the amount disables approval until a fresh review returns its exact hash and consequence. After a completed partial attempt, **Review a separate remaining refund** preserves the prior attempt and creates a new operation identity; stale repeats cannot restart it. Provider uncertainty never resets an attempt or creates a second refund.

Native approved results and signed/current external refunds share `access-evidence.ts`. Complete original payment/refund proof is required. Partial/pending/failed/uncertain amounts do not end access. A successful full refund can leave **Access processing** until admitted work drains. Ambiguous shared class roster/tag entries are preserved with **Class roster needs review**; content access still ends. A changed bank result after ending access needs deliberate recovery rather than automatic reenrollment. See [the shared access boundary](../../../../packages/common-logic/src/purchase-access/README.md).

## Routes — M07 / O10

Members use `/dashboard/refunds` to review a paid receipt, save a private text draft, then submit a request. Operators with the tenant's `setting:manage` permission use `/dashboard/refund-review`. Purchases are assigned to Al; an operator can record an escalation to KK. A request, its decision, and the provider's refund result have separate states. Saved requests are in the private review queue; **email notification is not configured by this slice**.

## Policy gate

`policy.ts` enables the approved full-versus-partial rule. Legacy saved policy-pending reviews must be refreshed before a new financial attempt; a prior provider attempt retains its original identity and must be reconciled rather than reset.

A verified class start at least 14 × 24 hours after the durable submission time qualifies for a full refund of the remaining payment. The exact boundary qualifies; a request one millisecond closer needs human review. Dates display in UTC. No class date is inferred or accepted from a browser command. A class whose payment association or schedule is uncertain needs evidence review. The automatic path requires a verified association and an approved access consequence before the member submits. Evidence resolved after submission must be reviewed explicitly; it does not silently apply a new financial consequence.

Monthly subscriptions stay in `/dashboard/membership` and the separate member-billing services. A one-time Checkout payment is proved from the provider's original `mode: payment`, never inferred from the membership's current plan after rejoining. Consequently, an old receipt can be shown even if its current plan has changed. An unproved legacy receipt remains reviewable but cannot refund automatically.

## Payment proof and recovery

The browser supplies only native invoice/request IDs, reason text, and the current review hash. The service loads the tenant-owned paid invoice and its member. The native stored Checkout transaction, payment mode, amount and currency must match the original Checkout session, PaymentIntent and captured Charge. Server-written Checkout invoice and membership metadata must match. Customer links must agree; an all-null customer chain is valid for a guest Checkout. Recurring, disputed, transferred, partially captured, ambiguous or mismatched payments are outside this adapter's automatic scope.

The server persists the actual currency, test/live mode, paid amount, existing refunds and exact remaining refundable amount in an expiring quote. Provider identifiers remain internal. Native invoice values use major currency units; browser quote values use Stripe minor units and the shared currency conversion handles zero-decimal and special currencies.

A unique tenant/invoice request and revision comparisons prevent duplicate requests and stale decisions. A five-minute claim serializes processing. A separate durable first-attempt claim is written before the provider is permitted to create a refund. A crash or uncertain database write cannot clear this claim. Later attempts search the complete charge refund history for the stable operation metadata and frozen quote hash; they never blindly create a second refund after an idempotency key could have expired.

Known pending, succeeded, failed, canceled and requires-action refunds remain distinct. A timeout is uncertain. A failed or canceled refund does not claim money was returned. Access consequences finish only on a proved successful or already-completed refund. Preflight failure before any first-attempt claim returns the request to review; prior approval history remains recorded. Changed native payment data, booking revision, policy, stale quote or review hash cannot start a refund under the previous review.

## Class booking evidence and checkout seam

`RefundBookingEvidence` records an explicit tenant/invoice/membership/session/user/course/cohort association, the actual stored start time, actor, explanation, revision and verification history. The operator must check the original receipt against the booking and attest to that association. Even a single matching cohort roster entry is insufficient: existing course-to-cohort synchronization can enroll every active course member, including a different historical purchase.

New explicitly listed class checkouts now accept a selected, current cohort fingerprint and persist `source: checkout` evidence before the provider attempt. `services/class-checkout` retains the exact invoice/session, native cohort document, booked start and intent identity; exact paid activation adds only the selected roster. Evidence reads require the completed paid intent, and changed/missing booking or schedule evidence becomes unknown. Existing receipts are not backfilled from current rosters. Active course owners still need operator help for another class. A full refund ends its exact content grant, while shared roster/tag ownership may need a separate review. See `../class-checkout/README.md` for retries, stopped-worker review and source/native proof limits.

## Privacy and read boundaries

Member Mimic receives only the approved subject's receipts and submitted request projection; it cannot see unsubmitted draft text or mutate any request. The operator queue is unavailable in Mimic. All mutations require an active tenant session, same-origin JSON, bounded strict inputs and rate limits. Operators additionally need actual payment-settings permission. Text is rendered as text and is never a prompt to execute. No public attachments or provider secrets enter the DTO.

Receipt links use the dedicated read-only `/dashboard/receipts/:invoiceId` route, never mutating checkout verification. Operator cards omit the owner-scoped receipt link and show the verified payment summary; an administrator who needs the member's receipt uses the existing Member Mimic flow.

## Integration and verification

- Register the default path export from `app/api/refund-requests/openapi.mjs` in the central OpenAPI index.
- Member routes: GET/POST `/api/refund-requests`; member page `/dashboard/refunds`.
- Operator routes: GET/POST `/api/refund-requests/review`; optional GET `invoiceId` loads actual class choices; page `/dashboard/refund-review`.
- Allow only the member GET route and page in Mimic; forbid the operator route and every mutation.
- Focused provider, real isolated Mongo workflow, REST boundary and React interaction tests live beside these routes/components. No test calls a real provider or sends email.
- Root owns native rollout, browser verification and the Changes report; these source changes have not been applied to a running site by this agent.

Primary Stripe references: [Checkout retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve?api-version=2025-02-24.acacia), [PaymentIntent object](https://docs.stripe.com/api/payment_intents/object?api-version=2025-02-24.acacia), [refund creation](https://docs.stripe.com/api/refunds/create?api-version=2025-02-24.acacia), [idempotent requests](https://docs.stripe.com/api/idempotent_requests). The installed SDK is Stripe 17.7 with API 2025-02-24.acacia.
