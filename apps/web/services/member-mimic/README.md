# Member Mimic

Selecting a member in `/dashboard/users` replaces the former bespoke user details screen with the same `/dashboard/profile` page members use. My content, Membership and published course navigation reuse their existing components. Membership reads resolve the subject through the billing service; cancellation/retry actions remain disabled and all Mimic writes are blocked. No member authentication session is created. The actor retains her actual authentication; each member read rechecks `user:manage`, tenant, active actor and subject, the actor's current authentication session, and a separate revocable Mimic record.

## API and integration

- `POST /api/member-mimic`: same-origin JSON `{ userId, returnTo? }`; requires member-management permission; returns `{ mimic: activeView, redirectTo: "/dashboard/profile" }` and an HttpOnly SameSite Strict cookie. `returnTo` accepts only Users, Subscribers, Transactions, cohort roster and product Customers/Transactions paths plus their query. External URLs, member start routes and unrelated admin destinations fall back to Users. Starts are limited to 12/minute per tenant/actor and bodies to 2 KB. A new view revokes older views in the same actor session.
- `GET /api/member-mimic`: returns `{ mimic }`, a discriminated inactive/active/expired view. Active contains only actor/subject public identity, expiry and return path. No token is included in JSON.
- `DELETE /api/member-mimic`: same-origin JSON request; revokes the record, clears the cookie and returns `{ redirectTo }`. Expired authentication still permits this explicit escape. An unknown or malformed marker also clears safely.
- `resolveMemberReadContext(headers, ctx)` returns ordinary/context, mimic/context, or expired. In a Mimic context, `user` is a plain read-only subject projection, `actor` is the real administrator, and `memberMimic` carries separate actor/subject IDs. Consumers must reject expired instead of falling back to administrator access. This is wired into GraphQL and direct media reads.
- GraphQL accepts only one bounded member query, forces published course/lesson reads and rejects mutations, arbitrary private roots and fragments. Native server actions and legacy API write/GET-side-effect routes are blocked by the proxy while any Mimic marker exists, even expired. No viewing updates either person's last activity.

## Visible behavior and privacy

Every member view has a fixed identity/Exit banner and a repeating translucent saffron diagonal MIMIC watermark. Video remains inline so fullscreen cannot hide that identity. Startup, focus, cross-tab changes and browser-cache restoration verify the view before showing cached children. Exit revokes server authority and replaces history with the member list; old browser entries cannot retain a hidden subject context.

Shared profile fields and newsletter preference are visible but read-only. Passwords, email codes, unsubscribe tokens, administrative permissions/tags, payment secrets, private feedback, drafts, community membership, practice completion and certificates are omitted. The shared feedback UI is not mounted. Quiz/SCORM and embedded activities are not launched, and completion/profile/consent controls cannot write. Purchase start, released groups and last system drip timestamp remain available as access/scheduling facts. The latter is not personal practice history. Draft-only groups and draft lesson IDs are filtered from course metadata as well as lesson content.

Profile, Membership, read-only receipts/refund requests, My content and course routes use the validated member context. Other navigation shows an explicit Exit prompt. Member access uses the authoritative access ledger and retained lesson snapshot, including ordinary lesson/media gates. Receipt reads do not reconcile payments or run financial actions as the member.

The shared `components/member-mimic/link.tsx` keeps member-name entries consistent and renders plain text without `user:manage`, without a target ID, or during Mimic. The existing start page carries the allowed source list through the server record to Exit; Subscribers restores its page, Users its page/filter controls, and Customers its search. A newsletter User row alone is not an account claim: its nullable `linkedMemberId` requires a currently active same-tenant user with Better Auth's recorded `emailVerified=true` or an active/expired native membership. This projection is read-only and grants no membership. Missing/legacy evidence remains unlinked rather than inferred from an email address or lead tag.

## Persistence and cleanup

`MemberMimic` stores tenant, opaque hashed token, hashed actor-session ID, actor/subject user IDs, timestamps, return path and active/revoked state. It stores no member name, email, content, credentials or payment data. Authority expires after 15 minutes; the browser marker lasts at most 24 hours so an expired view stays visibly blocked until Exit. Mongo indexes enforce one active view per tenant/actor session, and `init()` completes before session creation. Audit records expire after 90 days through `deleteAfter` TTL.

Account deletion calls `revokeMemberMimicForUser(domainId, userId)` from `graphql/users/helpers.ts`; active records involving either actor or subject are revoked. Existing requests also recheck account existence/permission, so deactivation or permission withdrawal removes authority without waiting for TTL. Historical IDs remain until audit expiry. Tenant deletion must stop that tenant's requests, call `deleteTenantMemberMimicData(domainId)`, then delete the tenant. This maintenance helper is not an exposed user endpoint.

## Operator verification

1. Click a member from a filtered member list. See her normal profile, the member's name/email in the banner, the watermark across the viewport, and disabled profile/newsletter controls.
2. Open My content and an entitled published lesson. Confirm content and navigation match the member view, with private practice progress omitted. Play audio/video; the banner remains visible. No quiz/SCORM session or completion write appears. Shared comments identify the real administrator rather than submitting as the member.
3. Try an unpublished lesson, another tenant, a private feedback link, checkout, community or admin route. See a denial or Exit prompt; no administrator access silently substitutes for the member.
4. Exit, then use Back, an old deep link, an external link, and another already-open tab. The old member identity stays hidden until verified; it cannot continue after revocation.
5. Let the view expire or revoke the actor's member-management permission. Reads fail closed and Exit remains available. Simulate a failed status/Exit request: no success is claimed and the prior view never becomes an unmarked member session.
6. Enter from a cohort roster, a linked newsletter subscriber, Users and Customers; Exit returns to the source and its preserved table controls. An anonymous newsletter-only row has no member link. A course-only operator sees plain names and retains existing course controls.

Focused Mongo/GraphQL tests live beside the API; lifecycle tests live under `components/member-mimic/__tests__`. They use isolated fixtures, not the running rig. User-visible release still requires the parent task's runtime/visual verification and changes deck.
