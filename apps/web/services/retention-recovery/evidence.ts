import { createHash } from "crypto";
import { z } from "zod";
import { requireCondition } from "../content-changes/errors";
import { fingerprint } from "../content-changes/stable";

const id = z.string().min(1).max(256);
const at = z.coerce.date();
const snapshot = z
    .object({
        cutoff: at,
        visibleLessonIds: z.array(id).max(10000),
        retainedLessonIds: z.array(id).max(10000),
        unknownReleaseCount: z.number().int().nonnegative(),
    })
    .strict();
const savedSchema = z.object({
    _id: id,
    domain: id,
    id,
    userId: id,
    courseId: id,
    membershipId: id,
    membershipSessionId: id,
    revision: z.number().int().nonnegative(),
    createdAt: at,
    start: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("recorded"), at }).strict(),
        z.object({ kind: z.literal("legacy-unknown") }).strict(),
    ]),
    state: z
        .object({
            kind: z.literal("ended"),
            operationId: id,
            snapshot,
            endedAt: at,
        })
        .strict(),
});
export interface RecoveryEvidence {
    domainId: string;
    adminUserId: string;
    preimageJson: string;
    preimageSha256: string;
}
export function plain(value: unknown): any {
    return JSON.parse(JSON.stringify(value));
}
export function digest(value: unknown) {
    return fingerprint(plain(value));
}

/** Hash the exact supplied UTF-8 bytes before interpreting a saved Mongo/EJSON document. */
export function parseEvidence(input: RecoveryEvidence) {
    requireCondition(
        Buffer.byteLength(input.preimageJson, "utf8") <= 1024 * 1024,
        "too_large",
        "The access preimage exceeds 1 MiB.",
        413,
    );
    const hash = createHash("sha256")
        .update(input.preimageJson, "utf8")
        .digest("hex");
    requireCondition(
        hash === input.preimageSha256,
        "conflict",
        "The captured preimage hash does not match.",
        409,
    );
    const decoded = JSON.parse(input.preimageJson, (_key, value) => {
        if (
            value &&
            typeof value === "object" &&
            Object.keys(value).length === 1
        ) {
            if (typeof value.$oid === "string") return value.$oid;
            if (typeof value.$date === "string") return value.$date;
        }
        return value;
    });
    const saved = savedSchema.parse(decoded);
    const proof = saved.state.snapshot;
    requireCondition(
        saved.domain === input.domainId &&
            new Set(proof.visibleLessonIds).size ===
                proof.visibleLessonIds.length &&
            new Set(proof.retainedLessonIds).size ===
                proof.retainedLessonIds.length &&
            proof.retainedLessonIds.every((id) =>
                proof.visibleLessonIds.includes(id),
            ),
        "conflict",
        "The captured access proof is inconsistent with this tenant.",
        409,
    );
    return saved;
}
export type SavedAccessPreimage = ReturnType<typeof parseEvidence>;
