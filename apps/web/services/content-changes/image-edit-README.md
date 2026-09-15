# Live page pictures

The existing text-edit API also accepts `kind: "image"` changes. The leaves response keeps image slots in `widgets[].images`, separate from visible text. `image-registry.ts` lists the exact native paths; the renderer's `data-kk-image-path` points to one of those paths. There is no arbitrary settings-path or selector evaluator.

A new image resolves through `resolvePublicImageMedia`: managed identity, this tenant's group, public raster MIME, usable HTTP(S) address, then sealing and revalidation. Submitted upload URLs never become canonical data. Existing picture metadata/alt text and unrelated settings remain; only ancestors of the selected source are copied. Shared native-value copying also preserves BSON in text/rich-text edits, stored proposal widget snapshots and proposal patch/draft-mirroring writes. The page/site compare-and-swap guard protects concurrent writes and conflicting drafts are refused. Published and existing draft copies move together.

Before replacing a media reference, the old and new media are pinned. The same `PageTextEdit` write-ahead record and atomic native source receipt used by text editing retain exact before/after pictures and actor. A lost settlement is recovered on the next leaves/history/edit request. Every retained state is a media reference, including an unsettled or failed write. The existing delayed collector rechecks those references. Failed incoming attachments are scheduled for collection; a committed history record protects them even when a response was lost.

Undo/History restore is a new edit naming `undoOf`. Image recovery must match an applied row from the same tenant, native source document, widget target and registered image path; its replacement is exactly that row's historical `before`. This is the only way a URL or placeholder can be introduced through live editing. Uploaded image metadata is resolved on the server; image history never accepts arbitrary client URL substitution.

## Included image slots

- Header mark; hero banner/mark/photo source; gathering photos; post thumbnails; private-session photo and enabled decoration; footer contact marks and active decorations; a native raster media block; a stored click-to-load tour poster.
- Embedded TipTap pictures in `rich-text.text` retain their native `attrs.src`, alt/title, sizing and surrounding prose. A managed replacement also carries `attrs.kkImageSource`; the reader uses it only while it agrees with `src`. Restoring a prior native URL removes that added metadata. The renderer marks original document indexes before filtering empty text nodes, so duplicate images and nested content have distinct stable targets. Its annotation is render-only. Managed pictures use the bounded public optimizer with native image geometry; no source-width descriptor claims pixels the source does not have.
- A newsletter has no image slot. The stock banner renders `Domain.logo` or a Course/Community featured image rather than page settings. Those retain their entity's native authoring route; this API deliberately does not write a misleading banner setting.
- Image alt/caption values remain separate from the source. This increment changes the image while preserving their existing values.

## Reproduce

1. Sign in with `site:manage`, outside Member Mimic. Turn on page editing and upload into a marked image well or replace an existing marked picture.
2. Reload: the picture survives; open History and restore its prior image or placeholder. Reload again and verify the previous picture is back.
3. Keep a different image in an unpublished draft, then attempt a live edit of that slot: the API refuses with a draft conflict.
4. Try the same request without the site-manager role, from another origin, or with a Member Mimic cookie: it is refused. A fabricated MediaLit group/private/SVG upload or arbitrary URL is refused before native publication.

Automated evidence: `app/api/content-changes/__tests__/image-edit.test.ts` covers registry/default/legacy images, canonical metadata, tenant/type/origin/Mimic guards, retained Undo, stale/draft refusal, source acknowledgment recovery and unedited BSON preservation. Existing text-edit tests run alongside it. Browser/release proof belongs to the root live-images evidence, not this source check.
