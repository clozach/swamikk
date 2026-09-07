import { randomUUID } from "crypto";
import type GQLContext from "@/models/GQLContext";
import CourseModel from "@/models/Course";
import type {
    DripChange,
    DripChangePatch,
    DripChangeVersion,
} from "../../../../packages/common-models/src/drip-change";
import type { InternalDripChange } from "../../../../packages/orm-models/src/models/drip-change";
import { DripChangeModel } from "./models";
import { prepareDripPreview } from "./preview";
import {
    editableCourse,
    plain,
    revisionFilter,
    scheduleFingerprint,
} from "./guard";
import { dripCreateSchema, dripPatchSchema } from "./validation";
import { fingerprint } from "../content-changes/stable";
import {
    ContentChangeError,
    requireCondition,
} from "../content-changes/errors";

function versionView(record: DripChangeVersion): DripChangeVersion {
    return {
        version: record.version,
        patch: record.patch,
        preview: record.preview,
        previewHash: record.previewHash,
        preparedBy: record.preparedBy,
        preparedAt: record.preparedAt,
    };
}
export function dripChangeView(record: InternalDripChange): DripChange {
    return plain({
        ...versionView(record),
        id: record.id,
        courseId: record.courseId,
        state: record.state,
        history: record.history,
        restoresChangeId: record.restoresChangeId,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    });
}
export async function getDripChange(id: string, ctx: GQLContext) {
    const record = await DripChangeModel.findOne({
        domain: ctx.subdomain._id,
        id,
    });
    requireCondition(record, "not_found", "Release draft not found.", 404);
    await editableCourse(record.courseId, ctx);
    return record;
}
async function prepareVersion(
    courseId: string,
    patch: DripChangePatch,
    version: number,
    ctx: GQLContext,
) {
    const prepared = await prepareDripPreview(courseId, patch, ctx);
    const data = {
        version,
        patch,
        preview: prepared.preview,
        baseline: prepared.baseline,
        proposedGroups: prepared.groups,
        preparedBy: ctx.user.userId,
        preparedAt: new Date().toISOString(),
    };
    return { ...data, previewHash: fingerprint(plain(data)) };
}
export async function createDripChange(raw: unknown, ctx: GQLContext) {
    const { courseId, patch } = dripCreateSchema.parse(raw);
    const prepared = await prepareVersion(courseId, patch, 1, ctx);
    requireCondition(
        scheduleFingerprint({
            groups: prepared.proposedGroups,
            published: prepared.preview.coursePublished,
        }) !== prepared.baseline.fingerprint,
        "no_change",
        "Choose a schedule change before saving a draft.",
    );
    return dripChangeView(
        await DripChangeModel.create({
            domain: ctx.subdomain._id,
            id: randomUUID(),
            courseId,
            ...prepared,
            state: { kind: "draft" },
            history: [],
        }),
    );
}
export async function refreshDripChange(
    id: string,
    version: number,
    patch: DripChangePatch | undefined,
    ctx: GQLContext,
) {
    const record = await getDripChange(id, ctx);
    requireCondition(
        record.version === version &&
            ["draft", "stale", "not-applied"].includes(record.state.kind),
        "conflict",
        "Refresh the draft before changing it.",
        409,
    );
    requireCondition(
        record.history.length < 20,
        "revision_limit",
        "Prepare a new draft after 20 revisions.",
        409,
    );
    const prepared = await prepareVersion(
        record.courseId,
        dripPatchSchema.parse(patch || record.patch),
        version + 1,
        ctx,
    );
    const saved = await DripChangeModel.findOneAndUpdate(
        {
            domain: ctx.subdomain._id,
            id,
            version,
            "state.kind": record.state.kind,
        },
        {
            $set: { ...prepared, state: { kind: "draft" } },
            $push: { history: versionView(record) },
        },
        { new: true },
    );
    requireCondition(
        saved,
        "conflict",
        "This draft changed. Open its current version.",
        409,
    );
    return dripChangeView(saved);
}
export async function discardDripChange(
    id: string,
    version: number,
    ctx: GQLContext,
) {
    await getDripChange(id, ctx);
    const saved = await DripChangeModel.findOneAndUpdate(
        {
            domain: ctx.subdomain._id,
            id,
            version,
            "state.kind": { $in: ["draft", "stale", "not-applied"] },
        },
        {
            $set: {
                state: { kind: "discarded", at: new Date().toISOString() },
            },
        },
        { new: true },
    );
    requireCondition(
        saved,
        "conflict",
        "A change in progress must be reconciled before it can be dismissed.",
        409,
    );
    return dripChangeView(saved);
}

async function settle(record: InternalDripChange, state: DripChange["state"]) {
    const operationId =
        "operationId" in record.state ? record.state.operationId : "";
    const saved = await DripChangeModel.findOneAndUpdate(
        {
            domain: record.domain,
            id: record.id,
            version: record.version,
            "state.operationId": operationId,
            "state.kind": { $in: ["applying", "uncertain"] },
        },
        {
            $set: { state },
            $unset: { activeCourse: 1 },
        },
        { new: true },
    );
    return dripChangeView(
        saved ||
            (await DripChangeModel.findOne({
                domain: record.domain,
                id: record.id,
            }))!,
    );
}

export async function approveDripChange(
    id: string,
    version: number,
    previewHash: string,
    ctx: GQLContext,
) {
    const record = await getDripChange(id, ctx);
    requireCondition(
        record.version === version && record.previewHash === previewHash,
        "conflict",
        "Approve the exact draft version you reviewed.",
        409,
    );
    if (record.state.kind === "applied") return dripChangeView(record);
    requireCondition(
        record.state.kind === "draft",
        "conflict",
        "Refresh or reconcile this draft before approval.",
        409,
    );
    const fresh = await prepareDripPreview(record.courseId, record.patch, ctx);
    if (
        new Date(record.preview.expiresAt).getTime() <= Date.now() ||
        fresh.baseline.revision !== record.baseline.revision ||
        fresh.baseline.fingerprint !== record.baseline.fingerprint ||
        fresh.preview.effectsHash !== record.preview.effectsHash
    ) {
        const stale = await DripChangeModel.findOneAndUpdate(
            { domain: record.domain, id, version, "state.kind": "draft" },
            {
                $set: {
                    state: {
                        kind: "stale",
                        reason: "The schedule, audience, or release timing changed. Refresh and review the new effects.",
                    },
                },
            },
            { new: true },
        );
        requireCondition(
            stale,
            "conflict",
            "This draft changed. Open its current version.",
            409,
        );
        return dripChangeView(stale);
    }
    const state = {
        kind: "applying" as const,
        operationId: randomUUID(),
        approvedBy: ctx.user.userId,
        at: new Date().toISOString(),
    };
    await DripChangeModel.init();
    let claimed;
    try {
        claimed = await DripChangeModel.findOneAndUpdate(
            {
                domain: record.domain,
                id,
                version,
                previewHash,
                "state.kind": "draft",
            },
            { $set: { state, activeCourse: record.courseId } },
            { new: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code === 11000)
            throw new ContentChangeError(
                "conflict",
                "Another schedule change is in progress. Reconcile it first.",
                409,
            );
        throw error;
    }
    requireCondition(
        claimed,
        "conflict",
        "This draft is already being processed. Refresh its status.",
        409,
    );
    try {
        const applied = await CourseModel.updateOne(
            {
                domain: record.domain,
                courseId: record.courseId,
                ...revisionFilter(record.baseline.revision),
            },
            {
                $set: {
                    groups: record.proposedGroups,
                    dripChangeReceipt: {
                        changeId: id,
                        version,
                        operationId: state.operationId,
                        outcome: "applied",
                        at: new Date(),
                    },
                },
                $inc: { __v: 1 },
            },
        );
        return settle(
            claimed,
            applied.modifiedCount === 1
                ? { ...state, kind: "applied" }
                : {
                      kind: "not-applied",
                      reason: "The course changed before this draft could be applied. Refresh the review.",
                  },
        );
    } catch {
        const uncertain = await DripChangeModel.findOneAndUpdate(
            {
                domain: record.domain,
                id,
                version,
                "state.operationId": state.operationId,
                "state.kind": "applying",
            },
            { $set: { state: { ...state, kind: "uncertain" } } },
            { new: true },
        );
        return dripChangeView(uncertain || claimed);
    }
}

export async function reconcileDripChange(id: string, ctx: GQLContext) {
    const record = await getDripChange(id, ctx);
    if (!["applying", "uncertain"].includes(record.state.kind))
        return dripChangeView(record);
    requireCondition(
        "operationId" in record.state,
        "conflict",
        "This operation needs its approval record.",
        409,
    );
    const course = await editableCourse(record.courseId, ctx);
    const receipt = course.dripChangeReceipt;
    if (
        receipt?.operationId === record.state.operationId &&
        receipt.outcome === "applied"
    )
        return settle(record, { ...record.state, kind: "applied" });
    // A version fence makes an earlier delayed native write unable to succeed.
    const fenced = await CourseModel.updateOne(
        {
            domain: record.domain,
            courseId: record.courseId,
            ...revisionFilter(record.baseline.revision),
        },
        {
            $set: {
                dripChangeReceipt: {
                    changeId: id,
                    version: record.version,
                    operationId: record.state.operationId,
                    outcome: "cancelled",
                    at: new Date(),
                },
            },
            $inc: { __v: 1 },
        },
    );
    if (fenced.modifiedCount === 1)
        return settle(record, {
            kind: "not-applied",
            reason: "Recovery confirmed the schedule was not changed. Prepare a fresh review before retrying.",
        });
    const current = await editableCourse(record.courseId, ctx);
    if (
        current.dripChangeReceipt?.operationId === record.state.operationId &&
        current.dripChangeReceipt.outcome === "applied"
    )
        return settle(record, { ...record.state, kind: "applied" });
    if ((current.__v || 0) > record.baseline.revision)
        return settle(record, {
            kind: "not-applied",
            reason: "The course moved to a newer version before this operation could apply. Prepare a fresh review.",
        });
    return dripChangeView(record);
}

export async function restoreDripChange(
    id: string,
    version: number,
    ctx: GQLContext,
) {
    const record = await getDripChange(id, ctx);
    requireCondition(
        record.version === version && record.state.kind === "applied",
        "conflict",
        "Only an applied schedule can prepare a restoration draft.",
        409,
    );
    const old = record.preview.before.find(
        (section) => section.id === record.patch.groupId,
    );
    requireCondition(
        old && old.rule.kind !== "unknown",
        "unknown_rule",
        "The previous legacy rule is unknown and cannot be restored automatically.",
        409,
    );
    const patch = {
        groupId: old.id,
        rule: old.rule,
        groupOrder: record.preview.before.map((section) => section.id),
        notificationEnabled: old.notification?.enabled || false,
    } as DripChangePatch;
    const prepared = await prepareVersion(record.courseId, patch, 1, ctx);
    return dripChangeView(
        await DripChangeModel.create({
            domain: record.domain,
            id: randomUUID(),
            courseId: record.courseId,
            ...prepared,
            state: { kind: "draft" },
            history: [],
            restoresChangeId: record.id,
        }),
    );
}
