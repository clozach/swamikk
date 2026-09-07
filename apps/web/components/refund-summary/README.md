# Refund history display

`RefundSummary` is the shared read-only display for the native receipt, each membership invoice, member purchase/class requests and admin refund review. It accepts the safe `MemberRefundSummary` DTO: currency **major units**, successful-refund total, exact per-refund status/amount and check time. It shows pending, action required, succeeded, failed and canceled separately. Missing evidence says unrecorded; a checked empty history is explicitly dated. No provider identifier, card detail, action, consent or access grant is added.

The original paid amount remains on the receipt and billing row. Request quote amounts remain the amounts captured for that review; the label identifies its earlier refunded amount and directs attention to later refund history. A completed request describes completion of that workflow, while its current money status is separate. A provider-canceled refund has its own label. Earlier “no additional refund needed” decisions are described at the time of their check rather than as permanent money facts.

Receipt and billing pages offer a read-only refresh, including in Member Mimic. Admin commands refresh the safe GET projection and retain the previous dated summary while the read is pending. The review GET batches native financial records and uses the same causal evidence projection as member reads. The optional purchaseAccess status separately reports processing, ended, class-roster review or recovery required. Reads do not apply those changes; the shared verified refund adapter does. Original request approval and money audit remain distinct.

Native verification:

1. Open a paid receipt with an externally observed partial refund. Confirm the original amount is still shown, and refund history shows the successful total, each exact amount/status and check time. Print the receipt; the financial history should remain in the printed body.
2. Open Membership and receipts. The same invoice keeps its Paid status and original amount, with separate refund history immediately below. Refresh after another signed event and check the separate confirmed access consequence: a partial purchase refund keeps access; a confirmed cumulative full purchase refund ends only its grant; monthly access remains separate.
3. Open a member purchase request and admin Refund review for that invoice. Check that the original request retains its decision history and the verified external access outcome appears separately. The amounts captured for its review stay distinct from newer observed money.
4. Refresh an admin payment review. Its follow-up GET must retain/update the financial summary; it must not disappear because the command returned only the request.
5. Repeat with pending, requires-action, failed and canceled results; none should become “Succeeded” or be included in the successful total. Unknown historical evidence must not become zero. Verify JPY and KWD amounts are not divided again.
6. Enter Member Mimic and refresh the receipt/billing view. The requests must remain GET-only. Exit/re-enter as another member and check that the previous member's financial history is absent. Admin refund review remains unavailable in Mimic.

Source checks live beside the shared display and in the existing receipt, billing and refund-request client suites. The signed refund lifecycle test covers the operator summary’s permission, policy and causal-freshness contract with real Mongo.
