# Section edits

A site manager can remove a complete authored body section immediately and recover it with Undo or History. The stored block is removed from the published layout and its matching draft together. Restoration reuses the complete stored `WidgetInstance`, including its ID, settings and media references, and places it among its surviving original neighbors. Header/footer slots, shared blocks, fixed blocks and arbitrary nested DOM elements are outside this operation.

## API

All routes require an active same-tenant `site:manage` user. A Member Mimic cookie, including an expired one, blocks every route; the service also rejects a Mimic context. POST requires same-origin JSON and a body of at most 4096 bytes. Each route has its own 120 requests/minute rate bucket per actor. Successful responses are `Cache-Control: no-store`; errors use `{error:{code,message}}`.

| Route                            | Input                                                                            | Response                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/section-edits`         | `pageId` query                                                                   | `PageSections`: immutable `documentId`, revision, removable section descriptors with fingerprints, and `removed` rows for persistent Undo positions |
| `POST /api/section-edits`        | `{action:"remove", requestId, target:{pageId,documentId,widgetId}, fingerprint}` | `{kind:"applied", edit}`                                                                                                                            |
| `POST /api/section-edits`        | `{action:"reverse", requestId, editId}`                                          | Reverses that applied operation and returns a new edit with `undoOf`                                                                                |
| `GET /api/section-edits/history` | `pageId`, optional opaque `before` query                                         | `{edits,nextCursor}`, 50 applied rows, newest first; equal timestamps use an ID tie-break                                                           |

`requestId` is a caller-generated UUID, reused with the same payload after an uncertain response. It becomes `editId`. Replaying that actor/payload returns the original result; reusing it for another payload or actor returns `409 idempotency_conflict`. Reversing a removal restores the section; reversing a restoration removes it again. The server obtains restoration data from the retained row, never from caller-supplied settings.

The public types are in `packages/common-models/src/section-edit.ts`. The OpenAPI module is `apps/web/app/api/section-edits/openapi.mjs`, exported as `sectionEditsApiOpenApi` for central registration.

## Persistence and interruption recovery

`SectionEdit` uses the `sectionedits` collection and `SectionEditSchema`. Its unique key is `{domain,editId}`. The immutable payload retains target document identity, editor, action, label, full block, original published/draft snapshots, ordering anchors, request hash and baseline page fingerprint/revision. Only its discriminated settlement state changes: `applying`, `applied`, or `failed` with a code/message. There is no TTL and no history-delete endpoint.

1. Validate the target, exact current block fingerprint and draft compatibility.
2. Write the complete operation as `applying` before changing page content.
3. Use the existing native page compare-and-swap guard to change both layouts, increment the revision and append the edit ID to `sectionEditReceipts` in one Mongo write.
4. Mark the retained row `applied`, then clear only that edit's receipt. A simultaneous operation's receipt remains intact.

This works with standalone Mongo; it does not depend on multi-document transactions. A process interruption after step 3 leaves a durable page receipt. GET or retry settles that receipt even after unrelated native/text edits. An interruption before the page write can retry the same operation against its original baseline; if the page moved meanwhile, it becomes `failed` and preserves the newer work. A lost response never requires guessing that a second deletion is the same action.

The guarded layout write uses the native Mongo collection so Mongoose does not re-cast already-stored legacy block IDs. Snapshots are cloned through BSON, preserving native ObjectId, date and binary values along with legacy embedded identity objects. Inputs cannot supply replacement blocks; the write uses the current stored page and retained server history.

Both web and shared Page schemas declare `sectionEditReceipts`. Native guarded saves and inline text edits preserve it because they update their own fields. `SectionEdit` history retains media references; shared media-reference collection must include it. Deploy matching app and queue versions containing that collector before enabling removals, so a queue on older code cannot collect media held only by section history.

## Drafts, ordering and limits

- Removal requires the selected draft block, when present, to match the published block's complete meaningful identity/settings. Unrelated draft blocks and unpublished page metadata are preserved. Duplicate section IDs are rejected before removal.
- Snapshots retain sibling IDs, including already removed sections, so deleting neighboring sections and restoring them in either order preserves their relationship. Restoration inserts beside surviving anchors without moving other blocks. Deliberately reversed or wholly missing anchors return `409 order_conflict`.
- Removal of the final block restores both formerly nonempty layouts. If a previously mirrored draft has become empty after intervening page changes, restoration returns `409 draft_conflict`; it does not invent a replacement draft. An originally absent draft remains absent, and a newly created conflicting draft is retained.
- Reversing a restoration requires the complete restored block still to match. Later edits to that block return `409 stale`, preserving those edits. Other sections' changes remain intact.
- The immutable native document ID prevents an old removal from affecting a replacement page at the same route. Whole-page deletion remains a separate operation. Section history survives it, but the old rows are not exposed through a replacement page's history.
- Snapshots preserve stored content. Omitted fields still use the **current renderer's defaults**; code, themes, fonts and future renderer behavior are not frozen historical assets.
- Section records retain editor IDs and content indefinitely by design. Whole-tenant erasure must explicitly include this collection; ordinary page or account deletion does not silently erase the recovery log.

## Verification

Run the native Mongo API suites from the repository root:

```sh
pnpm exec jest --config apps/web/jest.server.config.ts apps/web/app/api/section-edits/__tests__ --runInBand
```

The suites exercise full remove/restore/redo, media/settings/ID retention, the complete legacy homepage fixture, native BSON preservation, adjacent removal order, final-block drafts, newer live/draft changes, origin/permission/Mimic/tenant boundaries, immutable page replacement, duplicate deliveries, receipt recovery, interrupted pre-write retries, native write races and equal-timestamp pagination.

After deploying the matched app/queue build and mounting the section controls:

1. Sign in as a site manager, open a published page and enable its editing controls. Confirm only removable body sections offer ×.
2. Remove one section. Confirm it disappears without confirmation, surrounding sections keep their content/order, and Undo remains where the section was.
3. Reload; use that Undo. Confirm the original content, links, media and placement return. Open History and confirm separate removal/restoration entries.
4. Remove two neighboring sections, restore them in either order, and confirm their original relative order. Exercise keyboard undo/redo and inspect the additional History rows.
5. Change the selected section's unpublished draft in the Legacy builder, then attempt removal. Confirm the draft-conflict message and that published/draft content remains.
6. Use a member session or enter Member Mimic; confirm section controls are unavailable and direct API calls are denied.

The owning project's Changes deck supplies browser evidence. API tests alone do not establish that a running baked image includes this source.


### Local rehearsal — 15 September 2026

App source `d43420eb` and queue source `54a5c4e4` passed the local rehearsal. Desktop removal, focused in-place Undo, toolbar Redo, reload-persistent recovery, History restoration and mixed text/section keyboard Undo/Redo all worked. At a 390×844 viewport, pointer removal and Undo remained in view with no horizontal overflow. The original homepage's eight published and eight draft blocks were restored exactly; all ten applied section operations have settled History entries and no outstanding page receipts.

The final source checks passed 31 section tests and 195 content/page workflow tests, plus full web TypeScript and scoped lint/formatting. The earlier full repository checkpoint passed 254 suites and 2,171 tests. The owning vault evidence records build IDs, screenshots, baseline hashes and the separately retained failed pre-fix rehearsal; hosted rollout remains a separate release.
