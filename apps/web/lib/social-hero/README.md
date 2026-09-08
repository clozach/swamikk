# Social hero source changes

A pool belongs to the exact source configuration that built it. Its private `sourceKey` includes source identity, image/credit text and network configuration; changing only rotation or refresh timing does not invalidate the photos. Neither the key nor raw network tokens/upstream URLs enter the public pool DTO.

Serving and proxy admission read the current tenant record, even when the general tenant cache still holds older settings. Undated, legacy or differently keyed pools are rebuilt before serving. A delayed rebuild persists only while the same sources remain enabled, and a synchronous request rereads after that write before returning. Repeated concurrent edits produce an empty result after bounded retries. No settings migration or manual cache purge is required.

A stale pool with the same source key can serve while a refresh runs. A thrown refresh failure leaves that existing pool intact. Instagram and Facebook adapters remain unwired stubs; these tests do not claim provider integration or exercise a live network feed. Manual sources use their configured image URLs directly.

The public pool and image proxy return `Cache-Control: no-store`, including failure responses, so future page loads consult current settings. The proxy checks current enabled/source identity before fetching and again after the upstream response arrives. A removed or disabled source cannot authorize an old cached upstream. An already-open page retains its fetched rotation until reload; this change does not add live browser subscriptions or retroactively purge responses cached before rollout.

To verify a source edit, save a manual image or credit change, reload the public page, and confirm the new image/link in `/api/social-hero/pool`. Disable or remove it and confirm a new page load omits it. A manual photo has no proxy upstream and returns 404 at the image endpoint. Network response behavior is covered with isolated fetch fixtures, not a newly activated feed.

Focused checks live in `apps/web/app/api/social-hero/__tests__/cache.test.ts`: actual Mongo configuration/CAS interleavings, post-CAS edits, same-source failure, disabled/replaced/legacy proxy rejection, in-flight disable and response cache policy. Existing pool normalization and settings authority/token tests remain adjacent coverage.
