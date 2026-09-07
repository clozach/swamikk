# Anahata demo blog import

Prepared on September 6, 2026 from the live WordPress posts API, ordered by publication date descending. The search index was stale; it listed February 2026 and older posts. The captured first five are:

1. [Roasted Vegetable Salad](https://www.anahata-retreat.org.nz/2026/04/roasted-vegetable-salad) — April 20, 2026.
2. [Navigating the Change: A Guide to Embracing Menopause](https://www.anahata-retreat.org.nz/2026/04/navigating-the-change-a-guide-to-embracing-menopause) — April 20, 2026.
3. [The “Autumn Anchor” Tonic](https://www.anahata-retreat.org.nz/2026/03/the-autumn-anchor-tonic) — March 12, 2026.
4. [Beyond the Stretch: Why a Nervous System Reset is the Ultimate Life Cleaning](https://www.anahata-retreat.org.nz/2026/03/beyond-the-stretch-why-an-april-nervous-system-reset-is-the-ultimate-spring-cleaning) — March 12, 2026.
5. [The “Kiwi Yogi” Nourish Bowl](https://www.anahata-retreat.org.nz/2026/02/the-kiwi-yogi-nourish-bowl) — February 18, 2026.

The JSON snapshot preserves source HTML, hashes, original publication/modification dates, author attribution, featured-image URLs and a Tiptap document derived from the HTML. Each document ends with its original article link. The source's claims and event references are preserved as imported material, not rewritten as new membership-site promises. Featured image URLs are references; no image was downloaded. Dates in the snapshot are source dates, not fabricated CourseLit creation times.

`anahataDemoImportPlan()` is read-only. Root can call `importAnahataDemoBlogs(ctx)` with its existing authenticated admin context to create five unpublished blog drafts using the normal CourseLit create/update functions. Review the rendered drafts, source attribution, dated event offers and images before publishing through the normal admin flow. The function skips already imported source tags and preserves later human edits. It stops on a title collision; it does not adopt or overwrite an unrelated blog. A partial failure reports the new draft ID for review before retrying.

No runtime application or publication was performed in this preparation step.
