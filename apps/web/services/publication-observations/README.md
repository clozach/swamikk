# Verified publication observations

This administrator service records an upper bound: **the lesson was already published by this observation**. It never labels that time `firstPublishedAt`, derives a publication date from `createdAt`, or silently backfills history. There is no new collection and no runtime backfill in this implementation.

## Operator workflow

1. Read `GET /api/publication-observations?courseId=…` using a tenant-scoped account that may manage the course. The response lists up to 100 published lessons, true first-publication metadata when it already exists, and whether an earlier availability witness still matches. GET changes no course, lesson or access metadata. `hasMore` and `nextCursor` explicitly signal the next batch; pass `cursor=…` to continue the same tenant/course review.
2. Review the exact lesson IDs and the currently published course/section context.
3. Submit same-origin JSON `POST /api/publication-observations` with `{ "courseId": "…", "lessonIds": ["…"] }`. A maximum of 100 unique IDs and 16 KiB JSON are accepted. Clients cannot supply timestamps, group state, release revisions, actor IDs or other evidence.
4. Read each result. `recorded` confirms observation metadata; `already-recorded` reuses the matching witness without changing its timestamp/version. `publication-only` means publication was observed but the availability context changed before final verification. `skipped` identifies unavailable/changed lessons, unavailable courses/sections or an existing true first-publication date. `uncertain` requires a read before any retry. This is not an assertion that a member retained or lost anything.

Member Mimic, cross-tenant actors, ordinary members and cross-origin writes are refused. The route is rate limited and no-store. It changes evidence only: no publication toggle, membership, progress, invoice, mail, or payment mutation.

## Evidence and races

The service reads a published lesson, reads its course/section context, then updates observation metadata under the lesson's existing atomic version/content/group/publication guard. Successful compare-and-set proves that the lesson remained published through the intervening course observation. MongoDB supplies the observation timestamps. A competing lesson edit, unpublish or reassignment makes the guard fail; no observation is written from that stale sample.

`publishedBy` is the earliest verified publication upper bound. The availability witness is separately dated and records its group, whether the native rule was Available now or scheduled, and the course's `releaseRevision`. A renewed witness preserves the earliest publication upper bound. Native and approved O11 schedule/order/publication-state changes increment `releaseRevision`, including adding or removing a section. Unrelated lesson additions, text/assets, section names, notification edits, inactive rule values, and rank normalization that preserves order do not invalidate evidence. A changed course after its read can leave valid publication evidence with an obsolete availability witness. Retention treats that availability as unknown rather than trusting a stale context.

Lost write responses are checked once against the persisted observation operation ID. No failed response is assumed to mean “nothing happened.” The service does not blindly overwrite a competing witness.

## Retention meaning

The existing access service decides which published lesson IDs are visible at the cancellation cutoff. Observations only resolve missing date evidence within that decision; they do not create access or bypass a frozen grant.

- An Available now witness strictly before a new membership, still matching the group and release revision, proves pre-start archive. It remains visible during active membership and is excluded from post-cancellation retained drops.
- An actual member-specific group release during membership, with publication observed no later than that release, proves that effective release date. That lesson may be retained using the actual release evidence, even though its first publication date remains unknown.
- Publication and actual group release both proved before membership imply archive.
- An earlier membership start, stale availability witness, unknown group release timing, or observation later than the release being investigated remains unknown. A later observation cannot manufacture an earlier history.
- True native/verified first-publication dates continue to use the existing policy and take precedence. New lessons with real publication dates remain real drops.

**Invalidation is a limit on evidence, not removal of access.** A schedule change can make an observation insufficient for a later cancellation preview. Existing active access and already frozen retained IDs are unchanged. An administrator may observe current facts again, but cannot use that later witness to repair unknown facts before its time. Such cases keep the existing human review path.

## Cleanup and review

Observation metadata is stored on the lesson and is removed with lesson/course/tenant deletion. It contains only the pseudonymous administrator ID needed to attribute the observation, not member practice data or recipient addresses. There is no separate TTL or orphan collection.

Deterministic Mongo tests cover lesson edits/unpublish/reassignment before the guarded write, course schedule/unpublish/group removal across the observation, lost responses, idempotent retries, retained earliest upper bounds, earlier-membership unknowns, new-member archive, later real lessons, actual later group releases, and authenticated bounded REST access. Native and O11 tests verify revision increments for meaningful changes and preservation across unrelated edits and a recovery fence that applies no schedule change. Root owns runtime proof and any explicit operator observation of the existing library.
