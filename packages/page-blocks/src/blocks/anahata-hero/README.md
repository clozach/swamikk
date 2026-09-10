# Shared homepage image

The public hero has one image frame. On non-iOS desktops with a viewport at least 768px wide and a side-by-side welcome row, scrolling moves and crops it from the cover into the reserved 3:2 welcome image slot; scrolling back reverses the same journey. The image stays behind the welcome text column in the hero's existing isolated stacking context. iOS/iPadOS (including iPad's desktop user agent), narrow viewports and stacked rows use the single static welcome image with no separate cover or above-to-beside transition. The stored banner is used first. The stored welcome photo remains recoverable in settings and is used if the banner is absent. No Page content, IDs, image metadata or media records are changed.

## Redesign (2026-09-10, swamikk v1.0)

- Every picture is the shared `ImageSource` (`components/image-source.ts`): URL, media-library item, or a **placeholder** with a description. A placeholder renders `WaitingForAsset` in the exact box the image would occupy — the frame (cover band in scroll mode, 3:2 slot in static mode), the 835 × 120 wordmark overlay, or the 3:2 photo column. The well is the frame's one `role="img"`; over a banner well the wordmark well aligns to the top of the band so neither description covers the other. Defaults are the three spec § 1 wells.
- The welcome row is a split: text column (kicker · `<h1>` · offerings strip · paragraphs, one set as the Playfair lede via `ledeParagraphIndex` · primary + secondary buttons) and the photo column, on the side `photoPosition` names at md+ (`right` by default), stacked text-first on phones. The heading no longer spans above the row.
- Colours are v1.0 roles from `components/palette.ts`: ground bone, heading/lede/offerings pine, body ink, links pine → pine-deep, always underlined. Buttons: `pine` (pine fill, bone text), `moss` (moss fill, ink text, pine edge), hover/active pine-deep + bone, focus-visible pine outline; the older `saffron` / `saffron-big` / `white` names map onto pine / pine-large / outline so stored layouts keep rendering with no Anahata hex anywhere in this directory.
- Admin: `ImageSourceField` (URL · Library · Placeholder) for the three pictures, plus kicker, offerings (one per line), lede paragraph, photo position, secondary button and the new button styles.

The social-photo setting still uses its existing load-verified rotation. Only the shown photo receives an accessible name and source credit. The credit follows that frame and uses the shared external-link behavior. A failed/empty social pool keeps the stored image without a false credit. Reduced motion and the editor show the stored image, without rotation or a separate cover. With JavaScript unavailable, a noscript stylesheet uses the same static layout.

## Layout and motion

- `image-scroll-geometry.ts` computes a uniform scale and centered crop. The final visible bounds equal the destination slot; the photo never stretches.
- `use-image-scroll.ts` checks device, viewport and actual row eligibility, reads the cover/destination after layout changes, then caches them. Passive scroll events share one animation-frame callback and write only the transform, clip and credit variables. Static layouts do not schedule scroll paints. The source and destination reserve layout space. There is no sticky/fixed image or React state update on scroll.
- `shared-image.tsx` owns the one visual, wordmark, matching credit and fallback styles. The native Section's inner wrapper permits the frame to extend into the cover; the Section itself remains its positioning boundary. Other widgets and chrome keep their existing layout.
- The configured desktop photo offset remains in effect. Server rendering starts static; the layout effect enables eligible desktop motion before paint. Resizing, font settlement and reduced-motion changes recalculate or disable the journey; an invalid endpoint clears the old pose. Unmounting removes observers/listeners and pending paints.

The adjacent gatherings widget uses centered wrapping rows. Existing one/two/four-column widths remain at the same breakpoints, while incomplete rows are centered too. No event ordering or fields change.

## Verification

Run the focused web client test `apps/web/components/public/__tests__/anahata-homepage.test.tsx`. It checks the exact final crop and center, cached scroll reads, batched paints, cleanup, preference changes, iOS/iPad desktop identity, narrow/stacked resize transitions, invalid endpoints and single-photo name/credit behavior.

For native review, use the same homepage at 1280 px and 390 px:

1. On non-iOS desktop, start at the top, scroll halfway to Welcome, continue until the photo settles, then scroll back. Confirm one image and matching credit throughout; where it crosses the heading/body, the text remains above it and its links remain usable.
2. Compare the visible clipped photo bounds with the reserved slot. Check that the document does not scroll sideways and the heading is centered above the row.
3. On iOS/iPadOS and at390px, confirm the single static welcome image, useful heading/text order and no empty cover or above-to-beside motion. Repeat with reduced motion, without JavaScript and in the native editor without saving. Resize a desktop through a stacked/narrow row and back; the old transform clears and eligible desktop motion resumes.
4. In a source preview, use 0, 1, 2, 4, 5 and 6 gathering cards at desktop/tablet/phone widths. Each row, including a short final row, must center as a group.

The isolated source preview uses the actual widgets and native Section, with a Link-only test substitute and the generated package stylesheet. Its geometry checks do not establish native-site smoothness or physical-device behavior. Native before/after evidence is collected after the released package is running.
