# Verified retained-access recovery

This internal maintenance entry restores one exact captured ended-access preimage. It has no public route. The operator must verify that the preimage is a trusted capture of the original native operation, independently review its SHA256, and approve the dry-run receipt. A hash detects changed bytes; it does not authenticate an arbitrary operator-supplied file. Never supply guessed lesson IDs or manufacture publication dates.

The September 7 regression narrowed the saved `06:51:51.451Z` native cutoff to Stripe's `06:51:51.000Z`, discarded its frozen IDs, then resnapshotted later edited content. The original proof exists independently in `evidence/2026-09-06-mvp/stripe-external-native-proof/before-native.json` (`retentionAccess[0]`) and `evidence/2026-09-06-mvp/retention-native-outcome.json`. The regression fixture retains only the captured access record, without profile or payment details.

## Normal reconciliation

Stripe's raw ended-at seconds remain unchanged. A confirmed native cancellation is admitted only against the exact tenant, user, subscription, customer, mode, parent session, canceled operation and validated target access keys. Only that stored proof lets cap/reconciliation/read treat its existing exact frozen snapshot inside the same provider second as the same cancellation. A different operation, target or session, a missing confirmation, a genuinely earlier provider second, or a mere difference under one second does not qualify. No new snapshot or release gets a rounding allowance.

Before a real narrowing, `retentionHistory` preserves the original frozen state. If a provider event arrived before native confirmation was saved, later reconciliation can recover that same stored proof once confirmed. These private preimages follow the existing access-period account/tenant deletion boundary; they are never included in member DTOs, practice history or analytics. Read gates still reject unpublished/removed lessons and any IDs absent from the retained set. A claim/revision fence prevents an older event worker from overwriting concurrently attached proof.

## Build and invocation

From the reviewed repository root, build the maintenance entry and its already built shared packages from the same commit as the application:

```sh
node apps/web/services/retention-recovery/build.mjs /tmp/retention-recovery.mjs
```

Place this bundle where the clean installation's `node_modules` resolve. The web standalone image can omit package entry links needed by this maintenance bundle; placing it at `/app` is not sufficient in that image. A verified alternative is the clean queue image's full installation at `/app/apps/queue`, provided it is built from the same reviewed commit and uses the same selected database. The release operator verified that this location resolves `mongoose`, `zod` and `@courselit/orm-models` for commit `32200f39`. Run the unchanged bundle from that directory using the worker's existing environment; do not rebuild it against a different source tree or change its arguments or guards to accommodate placement.

`DB_CONNECTION_STRING` must already be set in the selected environment. It is never accepted in a request or printed. Keep the webhook forwarder and other relevant writers stopped during the reviewed maintenance window, as the release operator controls them. The choice of web or queue installation changes dependency resolution only; the administrator, subject, tenant, preimage/hash and dry-run/apply checks below remain identical.

Prepare a private request JSON containing exactly:

```json
{
    "domainId": "the selected tenant ID",
    "adminUserId": "the actual active site-settings administrator ID",
    "preimageJson": "the exact UTF-8 JSON string of the independently captured access document",
    "preimageSha256": "SHA256 of those exact UTF-8 preimageJson bytes"
}
```

Mongo relaxed EJSON `$oid` and ISO `$date` values are accepted. To select a record from a larger evidence file, generate `preimageJson = JSON.stringify(JSON.parse(file).retentionAccess[0])`, hash those exact bytes, and retain that selection beside the original evidence. Compare it with the independent native outcome capture before approval.

```sh
node retention-recovery.mjs dry-run request.json > reviewed-recovery.json
node retention-recovery.mjs apply request.json reviewed-recovery.json
```

The dry run checks the actual active administrator and member, exact current expired native session, period document ID/key/start/operation, current ended provider binding and confirmed native cancellation. It returns the original state to restore, exact current revision, current record hash, binding/proof hashes and a combined repair hash. It makes no database changes. Review all IDs, exact retained IDs/cutoff, and the current damaged state before the second command.

`currentHash` can be independently reproduced: read the whole current access document; normalize ObjectIds to strings and Dates to ISO strings (equivalent to `JSON.parse(JSON.stringify(mongooseLeanDocument))`); serialize recursively with sorted object keys, preserved array order and omitted undefined object values; SHA256 that UTF-8 serialization. `services/content-changes/stable.ts` defines the serializer, and `evidence.ts` exports `digest` for comparison. The binding hash covers its immutable identity, revision and state; operational claim/updated-at fields are deliberately excluded and claims are separately checked.

Apply reserves the still-active subject account and the exact binding, rereads all proofs, and uses a whole-period `$eq` preimage plus revision CAS. It restores only the saved ended state, increments revision, and retains the damaged state with the preimage and repair hashes. It does not change memberships, invoices, lessons, payment outcomes, release queues or sent messages. A changed/erased account, newer native session, different operation, stale receipt, mismatched bytes, intervening period write or busy claim fails closed.

Results: `applied` means state restoration and binding summary settled; `already-applied` means the same receipt already completed and its current binding still agrees; `applied-needs-reconciliation` means restoration committed but the binding requires the normal verified-provider reconciliation. A lost response may be retried with the same receipt. A crashed process can leave its non-expiring binding/account reservations: prove that worker stopped and use the established reservation recovery before retrying. Never clear a reservation just because time passed. Preserve all maintenance inputs/results with the release evidence, then verify the retained lesson, blocked archive/later lesson and unchanged invoice/native membership through ordinary member access and Member Mimic before restarting the forwarder.
