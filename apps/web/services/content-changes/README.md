# Contextual feedback and approved lesson changes

The API persists feedback and change proposals; it does not send email or invoke a model provider. A signed-in operator can copy a feedback prompt, prepare a proposal through the existing Codex workflow and POST it from the site session. An API key does not authenticate these endpoints. Feedback strings and display locators remain data; neither is executed.

Shared request/response types live in `packages/common-models/src/{feedback,content-change}.ts`. Route OpenAPI fragments live next to `/api/feedback` and `/api/content-changes`. All writes require the current site's `Origin` and `Content-Type: application/json`. Bodies are counted while reading, including chunked requests. Mongo counters enforce fixed-window limits across processes; they retain hashed bucket keys, not raw IPs.

## Operator proof

1. Submit a comment as a visitor, then as a member. Verify the member sees only her own feedback and cannot attach photos or obtain a preparation prompt. Feedback never changes content.
2. Sign in with `site:manage` or `course:manage_any` to read the private site inbox. Photos must belong to the same site's MediaLit group. `course:manage` alone can prepare and approve lessons it owns through native permission checks, but does not grant the whole-site inbox.
3. Prepare a text lesson proposal with a title and/or safe ProseMirror text patch. Read the returned before/after preview, live/draft context (`baseline.published`), version and preview hash. Verify the lesson remains unchanged.
4. Approve with that version and preview hash. Inspect `state.kind`, not just HTTP status. Repeating the approval cannot perform another content write. A revised proposal invalidates the older approval.
5. Change the lesson in the legacy editor before approval: approval returns `stale` without overwriting it. Native saves use a full-state atomic comparison plus a monotonically increasing revision; a document loaded before the approved write cannot later save over it.
6. Interrupt an apply. Reconcile the existing proposal. A receipt proves a committed edit. Otherwise reconciliation either proves the old write cannot commit or atomically advances only the revision and records cancellation, preventing a delayed request from writing. Database/read ambiguity retains `applying`/`uncertain` plus the target lock. Refresh and reconcile; never manufacture success or replay a new operation against an uncertain baseline.
7. From an applied change, prepare a recovery proposal. This does not restore content until separately approved. Any subsequent lesson edit prevents this automatic reverse operation, preserving later work.

The first adapter supports text lessons and text structure. New embedded HTML/assets are rejected; existing opaque/media nodes must be retained verbatim. Native validation and media handling run on application. If media processing changes the proposed JSON, the edit is not written and requires content-editor review. Page and drip adapters are separate future integrations, not alternate direct writes through this API.

## Persistence and cleanup

- `ContextualFeedback`: open records remain until handled. Closing assigns a 90-day TTL; reopening removes expiry. The member who submitted a record, or an inbox administrator, can DELETE it. Anonymous creation returns only its receipt and provides no anonymous read/list endpoint. Admin photo IDs reference existing library assets; deleting feedback does not delete those assets.
- `ContentChange`: no automatic expiry. Applied baselines, approvals and revision history are recovery/audit records. The API can remove only never-applied settled proposals. Applying/uncertain records retain a unique per-target lock and cannot be removed. Each proposal permits 20 revisions; start a new proposal after that. Approval records survive failed/stale outcomes.
- `FeedbackRateLimit`: hashed fixed-window counters expire after the next window. They contain no feedback text, email or raw IP.
- Account deletion calls `deleteUserFeedback(domainId, userId)` from `graphql/users/helpers.ts` through the session-independent `personal-data.ts` module. Proposal actor IDs remain as historical audit references; names and email addresses are not copied into proposal metadata.
- Tenant deletion integration: stop that tenant's writes/in-flight requests, reconcile outstanding operations, then call `deleteTenantContentChangeData(domainId)` before removing the tenant. It refuses cleanup with unresolved operations. These helpers are deliberately not exposed as public mutation endpoints.

The OpenAPI fragments are registered. The shared ? control supports held Ctrl/⌘ selection, a touch/keyboard chooser, retained tab drafts, admin-only page prompt collation and private photo uploads. `/dashboard/changes` renders before/after, consequences, approval/rejection, recovery and separately approved undo. `/dashboard/content` reads native products; the legacy tools have one removable Admin navigation entry. Both lists paginate with a timestamp-and-ID cursor; page prompt collation includes older feedback instead of silently stopping at50. Photo delivery rechecks admin, feedback attachment and tenant ownership and sends private no-store responses.

Model indexes must exist before taking traffic; `init()` gates the atomic counter and target claim. Tests use isolated Mongo memory instances and do not touch the running rig. Runtime rollout and the larger page/asset/drip adapters remain separate acceptance gates. Public feedback is currently a persisted private inbox; automatic mailbox delivery is still required by the MVP.
