# O11 release scheduling

`/dashboard/releases` is the focused CourseLit release administrator. The sidebar entry is registered once under Content; the existing builder remains the removable Legacy builder fallback. O11 retains its approved UX identifier; this change does not renumber the PDF.

## Scope and semantics

The page reuses native course sections and drip fields. All published lessons in a section release together. Rules are Available now (`status=false`), exact UTC time, or relative milliseconds. UI days are exactly 24 hours; they deliberately do not inherit the legacy builder's environment-specific demo unit. The first relative anchor is the recorded enrollment, later anchors are actual prior relative releases. The shared `common-logic/src/drip-schedule.ts` resolver supplies both review dates and the queue worker; later relative examples remain forecasts because actual delayed releases can move subsequent dates. Cohorts do not drive this worker.

A saved draft does not change native content, access or mail. Review includes current/proposed order and rules, active/processing members, already-released sections, ended membership periods, unknown anchors/publication dates, members newly gaining content now, members with due/resumable messages, message states and the exact existing template(s). Up to three current-member samples are pseudonymous. Enrollment/provenance identifiers are not returned in the preview.

Already recorded releases stay accessible if a date moves later. Canceled members consume only the existing authoritative frozen exact lesson IDs. Schedule updates cannot retract access already recorded, content already viewed or messages already sent. The worker re-reads current course scheduling after loading membership state, then checks its course version immediately before the atomic grant. These are separate documents: a grant or message already in progress can still finish under earlier settings. Review explicitly states this limit.

**Availability mode constraint:** changing Available now to/from scheduled is allowed only when the collection is unpublished and has no current native memberships. Unpublishing also prevents a concurrent new enrollment from briefly viewing a section under the earlier rule. The existing model has no per-member receipt of always-available sections, so such transitions could revoke earlier access or lose release provenance used by cancellation. Date/delay changes, ordering and notification toggles remain supported. A future availability migration must preserve earlier access and actual release evidence with recoverable per-member operations before removing this guard. Merely disabling drip is not a pause.

Notifications reuse the existing native section template. There is no duplicate message composer. A contextual comment can request new copy. `email.published=false` preserves the template and holds pending delivery intents. Enabling it can resume pending messages; the preview counts these members even when their section was already released. The worker checks the flag before enqueuing and immediately before claiming a delivery. Dispatching messages retain their eventual sent/uncertain result. Previously queued bodies may use an earlier template; the preview says so. Available now does not create release emails. Preview iframes are script-disabled and block remote resources.

## API and recovery

All routes use native tenant and course ownership/permission checks, active authenticated actor, no Member Mimic, bounded JSON, rate limits and no-store reads. Writes require this site's Origin. No caller-controlled actor or approval identity is accepted.

- `GET /api/drip-admin`: permitted collections.
- `GET /api/drip-admin?courseId=…`: sections, mode-transition constraint, latest 30 drafts/results.
- `POST /api/drip-admin`: `{courseId,patch:{groupId,rule,groupOrder,notificationEnabled}}` creates version 1.
- `GET /api/drip-admin/:id`: safe persisted draft/result.
- `POST /api/drip-admin/:id`: `approve {version,previewHash}`, `refresh {version,patch?}`, `discard {version}`, `reconcile`, or `restore {version}`.

Rules: `{kind:"available"}`, `{kind:"exact",at:ISO}`, `{kind:"relative",delayInMillis:integer}`. Order must contain each existing section exactly once. Bodies are capped at 32 KiB; 500 sections and 5,000 membership/access records are the explicit review ceiling. Larger audiences require a larger review rather than silently truncated counts.

Drafts keep up to 20 earlier reviewed versions. Review expires after five minutes; course revision/fingerprint, member/access state and materially changed due work invalidate approval. Fresh counts are a sampled view, not a cross-document transaction over every membership. The claim is atomic and one unsettled operation per course is enforced by a partial unique index. The native course update compares the captured course revision, then writes groups, an application receipt and a version increment together. Existing section update/reorder/move operations use the same version guard; native loaded-course saves use optimistic concurrency.

States are `draft`, `stale`, `applying`, `uncertain`, `applied`, `not-applied`, `discarded`. Lost native responses retain uncertainty. Reconcile reads the native receipt or advances the old version as a cancellation fence before reporting not-applied; a delayed earlier write then cannot succeed. Restoring settings always creates another unapproved draft and does not reverse delivery or entitlement.

## Persistence and deletion

`DripChange` is tenant-scoped and retains safe previews plus private native baselines/receipts; there is no TTL because unresolved operations and restoration baselines must survive restarts. User cleanup calls `deleteUserDripChanges`, which deletes that author's settled/draft records but preserves an unsettled pseudonymous lock for reconciliation. Course deletion removes every course draft after deleting the native course; its delayed apply can no longer match. Tenant deletion calls `deleteTenantDripChanges(domainId)`. No member practice history, feedback photos, provider data, credentials or message recipient addresses are copied into this collection.

## Verification and runtime handoff

Tests exercise actual Mongo course/ledger/proposal records, tenant and owner permission, same-origin REST requests, direct drafts, explicit approval, stale audience/course/time, double submit, uncertain applied responses, delayed-write fencing, restoration, availability constraints, pending-message counts and native concurrent writes. Queue checks cover sampling a stale schedule and holding/resuming mail. UI checks exercise saved review/acknowledgment, unsaved edits, stale/uncertain results and rule controls.

Root owns runtime/browser verification and Changes deck. Inspect `/dashboard/releases` at desktop and narrow width; choose a scheduled section, shorten its delay, save, inspect impacts/templates, acknowledge then approve. Verify rules changed only after approval. Prepare restoration, approve, and confirm the original schedule. In a second admin view change the native course, then confirm an earlier draft goes stale. Check notification off retains the exact template and pending status; restoring on shows the pending recipient in review. Use an isolated fixture and explicit review for any runtime mutation.
