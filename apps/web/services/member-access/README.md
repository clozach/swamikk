# Membership access and retained drops

The `MembershipAccess` collection is the authoritative access ledger for a course membership session. `User.purchases` remains a compatibility/progress cache; it cannot authorize content without an active membership or an exact retained lesson ID. Ordinary member views and Member Mimic use the same read functions. Reads never create or repair ledger data.

## Lifecycle integration

- On a new ACTIVE transition, persist `membership.accessActivation = { sessionId: membership.sessionId, startedAt }` before post-membership tasks. Rejoining rotates the membership session and this pair. `ensureMembershipAccess({ domainId, membership })` records it once. ACTIVE retries use `runPostMembershipTasks({ ..., recoveryOnly: true })`, repairing access/purchases while skipping duplicate activities and sequences.
- The key is `{ domainId, userId, courseId, membershipId, membershipSessionId }`. Billing can call `previewRetention(key, now)` without writes. An absent ledger or interrupted freeze returns an explicit unknown state. A preview is advisory; content may change before confirmation.
- After member confirmation, persist one operation ID and request cutoff. Call `prepareRetention({ ...key, operationId, cutoff })` for every included course before contacting the provider. It fences drip grants and captures exact visible/retained published lesson IDs. Repeated calls must use the same operation and cutoff. Interrupted freezing remains capped and is recoverable by retrying that operation.
- After provider cancellation is confirmed, call `endMembership({ ...key, operationId })`, including when a refund is pending or failed. An ended ledger overrides a delayed ACTIVE membership update. Native purchase/membership removal cannot delete retained grants; rejoining creates a separate period.
- `abortRetention({ ...key, operationId, providerStillActive: true, evidenceId })` is permitted only after the caller independently proves provider cancellation did not happen and the subscription remains active. The ledger also checks the matching native membership is ACTIVE. Ambiguous provider outcomes stay capped. An aborted operation ID cannot be reused.
- `getMembershipAccessSummary(key)` returns only start provenance, state, cutoff and counts. Provider IDs, payment details and practice history are outside this service.

## Access rules

Active membership includes the published archive and released drip sections. While cancellation is prepared, access is capped to the captured visible IDs. After cancellation, only captured IDs whose effective release falls within `[membership start, request cutoff)` remain available. Effective release is the later of the lesson's first publication and its actual recorded group release. A recorded release is kept even if the author later switches that section's drip off. Future drops, drafts, pre-start archive and new lessons inserted into an old released group are excluded after cancellation. Existing retained IDs survive rejoin; they do not unlock the rest of their group.

New native lessons begin with `publication.kind: never`; first publication atomically stores the database timestamp. Unpublishing/re-publishing does not reset it. Existing undated lessons and legacy membership starts are unknown, never assigned the observation/import date. Without sufficient evidence, visible content with unknown release timing is omitted from retention and counted in `unknownReleaseCount`. The separate [verified publication observation service](../publication-observations/README.md) can prove pre-start archive for a later membership, or combine a publication upper bound with an actual member-specific group release. It never supplies a first publication date or creates access. Verified historical imports must provide actual evidence and dates; no automatic backfill guesses them.

The snapshot reflects published content and the section configuration read during preparation. Native publication timestamps exclude content first published after the fixed cutoff. The ledger preserves granted release history, not a complete historical audit of every author schedule/content edit. Operators must not backdate metadata or replace content to counterfeit an earlier release.

Lesson reads, exact course navigation/Start links, My content, profile access projections, direct media downloads, token ZIP downloads, SCORM files/runtime and discussion lesson summaries use this gate. Standalone public site assets remain public. SCORM practice state stays unavailable in Mimic. Restricted media responses use `private, no-store`. Approved administrative preview/moderation remains separate.

## Drip recovery and mail

The queue records group grants and deterministic delivery intents in the same revisioned record. Scheduling uses the persisted period start and latest actual relative release. Cancellation's fence contends on that same revision. An uncommitted stale scheduler plan must be recomputed; an ended/prepared/freezing period cannot gain new grants. Purchase-cache repair is harmless if it trails the fence because no server gate trusts it.

Pending mail intents are recoverable after a crash. The worker claims each intent immediately before SMTP; it rechecks the period, active membership, active user and published course. A cancellation which wins before the claim suppresses the send. SMTP already in flight cannot be recalled; failures after dispatch remain `uncertain` and are not automatically resent. `dispatching` after a process crash likewise requires reconciliation.

During rollout, old queued drip jobs have no period/delivery provenance. Identify and drain or remove those old drip jobs before relying on the new guard; do not classify unrelated mail as drip. Broadcasts and membership-triggered sequences are separate mechanisms and do not inherit this drip cutoff automatically. No outbound configuration or real mail is required by these tests.

## Deletion and checks

Account deletion calls `deleteUserMemberAccess(domainId, userId)` inside `cleanupPersonalData`. Course deletion calls `deleteCourseMemberAccess`; tenant teardown must call `deleteTenantMemberAccess(domainId)`. These erase access data, including recovery intents, without altering the separate financial audit. Ordinary cancellation never deletes the ledger. Records have no expiry because retained access survives future membership sessions.

Focused server tests: `graphql/users/__tests__/member-access.test.ts`, `graphql/lessons/__tests__/{visibility,scorm}.test.ts`, `app/api/media/__tests__/member-access.test.ts`, `app/api/member-mimic/__tests__/{session,proxy}.test.ts`, and account deletion tests. Queue tests cover scheduling, real Mongo grant/freeze races and mocked SMTP claim/recovery. The native sidebar test checks a retained lesson opens while a new lesson in its locked group stays locked.

To review manually with isolated test data: activate a recorded membership with an older archive item, a new published item and a future drip; confirm the archive is visible. Preview cancellation without changing access. Confirm it, then check the new item remains, archive/future items disappear, and a new lesson added to the old group stays unavailable. Rejoin and verify archive returns during ACTIVE access while old retained IDs remain independently accessible. Repeat through Member Mimic and a copied media/SCORM/ZIP URL; exiting Mimic must remove the subject context.
