# Meeting questions

Separate native storage for shared meeting questions and each participant's own
editable answer. It does not create feedback, send mail, publish site changes,
change permissions, or inherit feedback's 90-day expiry.

## HTTP contract

Every route requires an active account in the selected domain with `site:manage`
or `course:manage_any`. Member Mimic cookies fail closed, including expired or
malformed cookies. Cross-site reads and writes are refused; writes require the
same origin and JSON. All responses, including errors, are private/no-store.
The trusted application proxy supplies the domain; bodies cannot choose a tenant
or answer author.

- `GET /api/meeting-questions` returns `{sets, answers, viewer}`. Questions and
  answers are ordered by numeric question number within each set. Answers include
  current text, revision and retained history. The viewer has `userId` and `name`.
- `POST /api/meeting-questions` takes `{set, expectedRevision}`. The set contains
  `id`, `title`, `intro` and `questions`; each question contains `id`, `number`,
  `title`, `group`, `context`, `candidateGroups` and `locations`. Start with
  revision 0; subsequent edits need the returned revision. Repeating identical
  content succeeds without incrementing it. Previously saved question IDs cannot
  be omitted; answers live separately and are never overwritten by reseeding.
- `POST /api/meeting-questions/answers` takes `{setId, questionId, text,
expectedRevision, mutationId}`. The signed-in account is the only possible
  author. Start at revision 0. Send a UUID for each logical save and reuse the
  exact body/UUID after an uncertain result. Identical retries return the original
  applied revision plus the latest answer; a reused UUID with different content
  or base revision conflicts. HTTP 409 returns `{kind:"conflict", current,
message}` for stale-answer/UUID conflicts. Keep the local draft and reload.

The shared types in `packages/common-models/src/meeting-question.ts` are the
frontend contract. The OpenAPI fragment documents sizes and errors. Question
sets are limited to 128 KiB/80 questions, with at most 16 candidate groups per question; answers to 12 KiB/4,000 characters.
Limits are 120 reads or 60 writes per minute per domain/account/operation.
Locations are local paths plus literal component IDs (1–200 letters, digits, underscores or hyphens, including a leading hyphen; no `#` prefix), never executable selectors
or external URLs. Candidate text is plain data for escaped rendering.

## Concurrency and undo

Each author/question has its own unique row. An atomic revision condition and
append-to-history update prevent lost writes within that row; different authors
can save independently. First-answer races use the unique index. Mutation IDs
remain in history, so a retry after later edits cannot apply the older text again.
Restoring an earlier revision prefills its text in the UI and saves it as a new
revision with a new mutation ID. Empty text is an intentional clear with the old
text retained. No answer can target another author.

All accepted revisions remain available. At 500 revisions the server refuses a
further change rather than truncating history or approaching MongoDB's document
size limit. This bound is per author's answer, not per meeting. It needs an
explicit later storage expansion if ever reached.

## Cleanup and identity

Question sets, answers and answer text/history are shared project records without
a TTL. Names and email addresses are not copied into stored author metadata.
Reads resolve the current account's display name; a missing account becomes
`{kind:"removed"}` without its former user ID. Free text is retained as authored.

`redactMeetingQuestionAuthor(domainId, userId)` checks the existing account-erasure
fence before removing the stored author association, retaining shared text and
history. Writes hold the same account reservation, so erasure cannot race a late
answer recreation. The native user-erasure cleanup in `apps/web/graphql/users/helpers.ts` calls
this helper beside `purgeMemberEdits`; its integration test proves shared text and
history remain while only the erased account association is removed. Missing-user projection already redacts API output independently.

`deleteTenantMeetingQuestions(domainId)` removes both collections for offline
whole-site teardown. Stop tenant traffic and writes before calling; this helper
is not an exposed endpoint. No cleanup or runtime mutation was executed here.

## Verification

From the fork root:

```sh
pnpm exec jest --config apps/web/jest.server.config.ts --runInBand apps/web/app/api/meeting-questions/__tests__/workflow.test.ts
```

The route suite uses an isolated MongoMemoryServer and mocked authentication.
It checks permissions/tenant/Mimic/origin/size/rate boundaries, strict seed
validation, set updates, concurrent own/different-author saves, retries after
later changes, preserved history/clear/restore, and missing-author redaction.
Root owns frontend verification, account-erasure integration coordination,
local/hosted release, native seeding, Changes/docsite and aggregate commit.
