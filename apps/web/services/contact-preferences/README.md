# Private contact preferences

P10/M05 lives in the existing `/dashboard/profile` page, linked from `/p/contact`. Members can save email/voice/text reply details, opt into occasional personal check-ins, and explicitly share/replace/remove one optional private photo. Defaults are the existing sign-in email, no check-ins and no photo. A reply email is not a sign-in email change; no contact channel or check-in schedule is promised. News consent remains a separate explicit choice.

`GET /api/contact-preferences` reads the active authenticated member, or the verified subject of an authorized Member Mimic session. No member ID parameter is accepted. `PUT` requires same-origin JSON, active ownership and no Mimic cookie/context. One revision compare-and-swap protects the whole preference record against stale saves, including restored photos. Reading never creates a record or changes consent. Failure keeps form input and offers an explicit reload. The private form is not mounted until loading succeeds.

`GET /api/contact-preferences/photo` applies the same current tenant/account/Mimic checks. The normal DTO includes photo presence/version only. The JPEG response is private/no-store, same-origin and unoptimized; it does not expose a MediaLit asset or signed URL. Anonymous, other-member, cross-tenant, expired-session and revoked-admin reads fail. The member and KK/support can see a deliberately shared photo; no public/comment/receipt/mail payload includes it.

Uploads are explicit base64 JSON, bounded to 3 MB request / 2 MB decoded source. Sharp accepts a still JPEG, PNG or WebP, limits decoding to 16 million pixels, resizes to at most 512×512, re-encodes JPEG and drops EXIF/GPS/ICC metadata. One small binary lives in the same private Mongo record; no extra storage provider or public library asset is created. Removal atomically deletes the binary. Replacement overwrites it. Stale revisions cannot restore it. A photo already displayed to an authorized person cannot be recalled from their screen; new reads always recheck permission.

The collection is uniquely keyed by `(domain,userId)`. Account deletion calls `deleteUserContactPreferences` from the existing cleanup path. It atomically removes all contact/check-in/photo fields and keeps a minimal deleted marker (domain/user IDs, revision and time) in the same record, so a save already in flight cannot recreate private data. This marker does not contain the contact details or photo. Tenant removal must first stop tenant requests and call `deleteTenantContactPreferences`. Database backups retain their ordinary backup history; no promise of instant erasure from backups is made. Rollout performs no migration and resets no existing choices.

# Newsletter and service messages

New OTP/ordinary/invited accounts default to news off. Explicit newsletter form submission and the separate profile newsletter Save action opt in; an existing unsubscribed person can genuinely rejoin. A conditional update deduplicates repeat subscription transitions. Existing explicit true/false choices are untouched by normal account creation. The existing sequence handoff remains separate from saved consent; saved consent alone does not prove any message was delivered.

Unsubscribe works without login. GET presents a readable confirmation with no account address/token in its body; POST retains the one-click JSON response. Repeated/unknown tokens reveal no account existence and are harmless. Errors do not claim success. Confirmation uses no-store/no-referrer and no outside assets. Mimic cannot change newsletter consent.

Newsletter consent gates broadcasts and marketing sequences. Sign-in codes, receipts and access/drip messages use their existing independent paths. Generic activity notices now obey their per-activity notification setting, account active state and permission checks rather than newsletter consent. Their footer leads to `/dashboard/notifications`, the effective preference screen; they carry no misleading newsletter unsubscribe header. Broadcast/sequence unsubscribe behavior is unchanged.

# Verification

- Open Profile as a member. Confirm no check-ins/photo by default. Edit the preferred method/detail, choose occasional check-ins, Save, reload and confirm persistence without changing sign-in email or news.
- Force a save error; input remains. Retry. Open two tabs, save in one and verify the stale tab cannot overwrite it.
- Choose a photo: preview stays local until Save. Save, replace and remove; inspect that removal persists and the old version URL returns 404. Try invalid/oversized files.
- Open the same member in Mimic. Read shared preferences/photo; all writes are unavailable. Expire/revoke the support session and verify photo reads fail. Direct other-member ID query parameters cannot select a target.
- Use the newsletter form for an unsubscribed test member; verify one subscription transition despite repetition. Turn news off in Profile, Save, reload. Follow the unsubscribe link without login twice and verify a readable confirmation. Code/receipt/drip and explicitly enabled service notification delivery remain independently configured.
- Toggle one activity email preference off at `/dashboard/notifications`; verify that notice stops while unrelated enabled notices still follow their own settings.

Focused tests: contact API 15; contact UI 5; unsubscribe 3; OTP consent/mail 2; existing mails/users suites with new transition checks; queue email/actual dispatch 11. Tests mock outbound mail and use isolated Mongo. Root owns production builds, runtime review, native data updates, release notes and Changes captures.
