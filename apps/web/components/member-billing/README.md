# Member billing screens

The member’s Profile links to **Membership and receipts** at `/dashboard/membership`. This reuses the authenticated subject’s native membership and invoice records. Member Mimic can read the same view, with financial mutations disabled; changing subjects unmounts the previous subject’s view and discards late responses.

Cancellation has two steps: prepare an expiring payment/access review, then explicitly confirm that version. The review shows the full current paid month, any previous refund, the remaining refund, retained content, archive removal and stopped future drops. A saved uncertain operation is reconciled by its original ID and hash. Pending, failed and uncertain refunds have distinct wording and never imply money was returned. Native invoice values are major currency units; quote/refund values are Stripe charge units.

Once cancellation is confirmed and access is ended, the closing section offers My content, optional private text feedback and a way to connect with Swami. It adds no deadline, urgency or invented gift media. Shared feedback supplies the established text-only member / photo-enabled admin behavior.

The cancellation review and farewell comment fill a narrow visual viewport, including its offset when zoomed or raised by an on-screen keyboard. On desktop they remain bounded reading panels. Cancellation actions stay above the separately scrolling consequence text, with the confirm action at the right and the safe close action first. The farewell comment retains its standard header Close and Send controls; its header Close preserves an unsent draft. Both panels suppress the duplicate primitive close icon. Viewport size changes apply immediately rather than animating through clipped bounds.

These panels opt into `ui/viewport-dialog.tsx`; the generic Dialog remains unchanged. The community rejection confirmation uses the same frame after its Close control was reproduced above a short viewport. Archive-plan confirmation remained within the checked bounds; refund request and payment forms are inline and do not share the fixed-dialog mechanism. Closing returns focus to the connected, visible opener from that opening, unless navigation, another dialog or a deliberate focus move takes precedence. Billing remembers the initiating button before the delayed review request; if confirmation removes that button, focus returns to its original membership card without adding the card to normal Tab navigation.

Browser verification after rebuilding:

1. Open Profile → Membership and receipts. Check recorded payments, test labels and the empty/error states.
2. Prepare cancellation. Read the payment/access consequences; close with Keep my membership or Escape and verify no cancellation occurred.
3. Prepare again and confirm. Verify renewal/access and refund statuses independently. A delayed or failed refund must not claim success or restore membership access.
4. Refresh an uncertain operation and verify it rechecks the saved request. A stale review must require a refreshed quote.
5. In Member Mimic, verify billing belongs to the selected member and cancellation controls are disabled. Switch/exit Mimic while a response is pending and verify no former member details remain.
6. On a narrow phone screen and with keyboard navigation, verify dialog scrolling, focus restoration, 44px minimum interactive target dimensions and the quiet farewell offerings.
7. Check both a quoted and a confirmed cancellation at 390×844 and a short viewport: actions stay visible while the review body scrolls. Tab to the body and use Page Down, then close without confirming. In farewell feedback, type an unsent draft, use header Close, reopen and verify the draft remains. No new purchase is required for isolated component verification; label those captures separately from the deployed site and physical-device proof.

Automated component coverage is in `__tests__/billing.test.tsx`. The API’s database/provider guarantees and remaining legacy-data limitations are documented in `services/member-billing/README.md`.
