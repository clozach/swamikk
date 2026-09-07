import { createHash, randomUUID } from "crypto";
import { Constants } from "@courselit/common-models";
import type {
    AccessDeliveryIntent,
    MembershipAccessKey,
    MembershipAccessPeriod,
} from "../../../common-models/src/member-access";
import type { InternalMembershipAccess } from "../../../orm-models/src/models/member-access";
import {
    AccessMembershipModel,
    AccessCourseModel,
    AccessUserModel,
    MembershipAccessModel,
} from "./models";
import { accessAssert, MemberAccessError } from "./errors";

const MAX_CAS_ATTEMPTS = 8;

function keyFilter(key: MembershipAccessKey) {
    return {
        domain: key.domainId,
        userId: key.userId,
        courseId: key.courseId,
        membershipId: key.membershipId,
        membershipSessionId: key.membershipSessionId,
    };
}

function publicPeriod(
    period: InternalMembershipAccess,
): MembershipAccessPeriod {
    const { domain, ...rest } = period;
    return { ...rest, domainId: String(domain) };
}

async function membershipIsActive(period: InternalMembershipAccess) {
    return Boolean(
        await AccessMembershipModel.exists({
            domain: period.domain,
            userId: period.userId,
            entityId: period.courseId,
            entityType: Constants.MembershipEntityType.COURSE,
            membershipId: period.membershipId,
            sessionId: period.membershipSessionId,
            status: Constants.MembershipStatus.ACTIVE,
        }),
    );
}

async function activePeriod(domainId: string, periodId: string) {
    const period = await MembershipAccessModel.findOne({
        domain: domainId,
        id: periodId,
        "state.kind": "active",
    }).lean();
    if (!period || !(await membershipIsActive(period))) return null;
    const [user, course] = await Promise.all([
        AccessUserModel.exists({
            domain: period.domain,
            userId: period.userId,
            active: true,
        }),
        AccessCourseModel.exists({
            domain: period.domain,
            courseId: period.courseId,
            published: true,
        }),
    ]);
    return user && course ? period : null;
}

/** Grant and pending mail intent commit together; freezing contends on this same revision. */
export async function recordDripRelease(
    key: MembershipAccessKey,
    groupIds: string[],
    relativeGroupIds: string[],
    emailGroupIds: string[],
    at: Date,
    expectedRevision?: number,
): Promise<MembershipAccessPeriod | null> {
    accessAssert(
        Number.isFinite(at.getTime()),
        "invalid",
        "A valid drip release time is required.",
    );
    const relative = new Set(relativeGroupIds);
    const emailed = new Set(emailGroupIds);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const period = await MembershipAccessModel.findOne({
            ...keyFilter(key),
            "state.kind": "active",
        }).lean();
        if (!period || !(await membershipIsActive(period))) return null;
        if (
            expectedRevision !== undefined &&
            period.revision !== expectedRevision
        )
            return null;
        const existing = new Set(
            period.groupReleases.map((release) => release.groupId),
        );
        const newIds = Array.from(new Set(groupIds)).filter(
            (id) => id && !existing.has(id),
        );
        if (!newIds.length) return publicPeriod(period);
        const deliveries: AccessDeliveryIntent[] = newIds
            .filter((id) => emailed.has(id))
            .map((groupId) => ({
                id: createHash("sha256")
                    .update(`${period.id}\0${groupId}`)
                    .digest("hex"),
                groupId,
                createdAt: at,
                state: { kind: "pending" },
            }));
        const released = await MembershipAccessModel.findOneAndUpdate(
            {
                ...keyFilter(key),
                revision: period.revision,
                "state.kind": "active",
            },
            {
                $push: {
                    groupReleases: {
                        $each: newIds.map((groupId) => ({
                            kind: "drip",
                            groupId,
                            at,
                        })),
                    },
                    ...(deliveries.length
                        ? { deliveries: { $each: deliveries } }
                        : {}),
                },
                $set: { updatedAt: new Date() },
                ...(newIds.some((id) => relative.has(id))
                    ? { $max: { lastRelativeReleaseAt: at } }
                    : {}),
                $inc: { revision: 1 },
            },
            { new: true },
        ).lean();
        if (released) return publicPeriod(released);
        // The scheduler must recompute against the new relative anchor.
        if (expectedRevision !== undefined) return null;
    }
    throw new MemberAccessError(
        "unavailable",
        "Drip access changed repeatedly; retry with fresh state.",
    );
}

/** Re-enqueue pending intents even if a prior pass already committed every group. */
export async function getPendingDripDeliveries(
    domainId: string,
    periodId: string,
): Promise<AccessDeliveryIntent[]> {
    const period = await activePeriod(domainId, periodId);
    return (
        period?.deliveries.filter(
            (delivery) => delivery.state.kind === "pending",
        ) || []
    );
}

export async function claimDelivery(
    domainId: string,
    periodId: string,
    deliveryId: string,
    at = new Date(),
): Promise<{ kind: "claimed"; claimId: string } | { kind: "skipped" }> {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const period = await activePeriod(domainId, periodId);
        if (
            !period ||
            !period.deliveries.some(
                (delivery) =>
                    delivery.id === deliveryId &&
                    delivery.state.kind === "pending",
            )
        )
            return { kind: "skipped" };
        const claimId = randomUUID();
        const result = await MembershipAccessModel.updateOne(
            {
                domain: domainId,
                id: periodId,
                revision: period.revision,
                "state.kind": "active",
                deliveries: {
                    $elemMatch: { id: deliveryId, "state.kind": "pending" },
                },
            },
            {
                $set: {
                    "deliveries.$.state": {
                        kind: "dispatching",
                        claimedAt: at,
                        claimId,
                    },
                    updatedAt: at,
                },
                $inc: { revision: 1 },
            },
        );
        if (result.modifiedCount) return { kind: "claimed", claimId };
    }
    throw new MemberAccessError(
        "unavailable",
        "The drip delivery changed repeatedly; retry its pending intent.",
    );
}

/** SMTP already in flight cannot be recalled; record its result even after a freeze. */
export async function finishDelivery(
    domainId: string,
    periodId: string,
    deliveryId: string,
    claimId: string,
    outcome: "sent" | "uncertain",
    at = new Date(),
): Promise<void> {
    await MembershipAccessModel.updateOne(
        {
            domain: domainId,
            id: periodId,
            deliveries: {
                $elemMatch: {
                    id: deliveryId,
                    "state.kind": "dispatching",
                    "state.claimId": claimId,
                },
            },
        },
        {
            $set: {
                "deliveries.$.state":
                    outcome === "sent"
                        ? { kind: "sent", at }
                        : { kind: "uncertain", at, claimId },
                updatedAt: at,
            },
            $inc: { revision: 1 },
        },
    );
}

/** Recoverable compatibility cache only. Access/retention reads must use the ledger. */
export async function projectDripAccess(
    key: MembershipAccessKey,
): Promise<void> {
    const period = await MembershipAccessModel.findOne({
        ...keyFilter(key),
        "state.kind": "active",
    }).lean();
    if (!period || !(await membershipIsActive(period))) return;
    // A concurrent freeze can overtake this cross-document cache write. It cannot
    // create entitlement: authoritative reads use the period and its frozen IDs.
    await AccessUserModel.updateOne(
        {
            domain: key.domainId,
            userId: key.userId,
            "purchases.courseId": key.courseId,
        },
        {
            $set: {
                "purchases.$.accessibleGroups": Array.from(
                    new Set(
                        period.groupReleases.map((release) => release.groupId),
                    ),
                ),
                ...(period.lastRelativeReleaseAt
                    ? { "purchases.$.lastDripAt": period.lastRelativeReleaseAt }
                    : {}),
            },
            ...(!period.lastRelativeReleaseAt
                ? { $unset: { "purchases.$.lastDripAt": 1 } }
                : {}),
        },
    );
}
