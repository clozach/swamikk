import mongoose from "mongoose";
import { Constants } from "@courselit/common-models";
import {
    AccessMembershipModel,
    AccessCourseModel,
    AccessUserModel,
    MembershipAccessModel,
} from "../../../../../packages/common-logic/src/member-access/models";
import {
    recordDripRelease,
    getPendingDripDeliveries,
    claimDelivery,
    finishDelivery,
    projectDripAccess,
} from "../../../../../packages/common-logic/src/member-access/drip";
import type { MembershipAccessKey } from "../../../../../packages/common-models/src/member-access";
import { cleanup } from "../../../setupTests";

const at = new Date("2026-01-10T00:00:00.000Z");
let key: MembershipAccessKey;
beforeEach(async () => {
    key = {
        domainId: new mongoose.Types.ObjectId().toString(),
        membershipId: "membership-1",
        membershipSessionId: "session-1",
        userId: "member-1",
        courseId: "course-1",
    };
    await AccessUserModel.create({
        domain: key.domainId,
        userId: key.userId,
        email: "member@example.com",
        active: true,
    });
    await AccessCourseModel.create({
        domain: key.domainId,
        courseId: key.courseId,
        title: "Course",
        slug: "course",
        creatorId: "author",
        published: true,
        cost: 0,
        costType: "free",
        privacy: "public",
        type: "course",
        groups: [
            {
                _id: "group-1",
                name: "One",
                rank: 1,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 0,
                    email: {
                        published: true,
                        subject: "Ready",
                        content: {
                            content: [],
                            style: {
                                colors: {},
                                typography: {},
                                structure: {},
                            },
                            meta: {},
                        },
                    },
                },
            },
        ],
    });
    await AccessMembershipModel.create({
        domain: key.domainId,
        membershipId: key.membershipId,
        sessionId: key.membershipSessionId,
        userId: key.userId,
        entityId: key.courseId,
        entityType: Constants.MembershipEntityType.COURSE,
        paymentPlanId: "plan-1",
        status: Constants.MembershipStatus.ACTIVE,
    });
    const { domainId, ...ids } = key;
    await MembershipAccessModel.create({
        ...ids,
        domain: domainId,
        id: "period-1",
        start: { kind: "recorded", at },
        state: { kind: "active" },
        groupReleases: [],
        deliveries: [],
        revision: 0,
        createdAt: at,
        updatedAt: at,
    });
});
afterEach(async () => {
    jest.restoreAllMocks();
    await cleanup();
});

const readPeriod = () =>
    MembershipAccessModel.findOne({
        domain: key.domainId,
        id: "period-1",
    }).lean();

/** Same CAS boundary used by prepareRetention, including retry after a winning grant. */
async function freezePeriod() {
    for (;;) {
        const period = await readPeriod();
        if (!period || period.state.kind !== "active") return period;
        const frozen = await MembershipAccessModel.findOneAndUpdate(
            {
                domain: key.domainId,
                id: period.id,
                revision: period.revision,
                "state.kind": "active",
            },
            {
                $set: {
                    state: {
                        kind: "freezing",
                        operationId: "cancel-1",
                        cutoff: at,
                        requestedAt: at,
                    },
                },
                $inc: { revision: 1 },
            },
            { new: true },
        ).lean();
        if (frozen) return frozen;
    }
}

async function grant() {
    const period = await recordDripRelease(
        key,
        ["group-1"],
        ["group-1"],
        ["group-1"],
        at,
        0,
    );
    expect(period).not.toBeNull();
    return period!;
}

describe("authoritative drip grants in Mongo", () => {
    it("commits grant and deterministic delivery once under concurrent grants", async () => {
        const results = await Promise.all([
            recordDripRelease(
                key,
                ["group-1", "group-1"],
                ["group-1"],
                ["group-1"],
                at,
                0,
            ),
            recordDripRelease(
                key,
                ["group-1"],
                ["group-1"],
                ["group-1"],
                at,
                0,
            ),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
        const period = await readPeriod();
        expect(period!.groupReleases).toEqual([
            { kind: "drip", groupId: "group-1", at },
        ]);
        expect(period!.deliveries).toHaveLength(1);
        expect(period!.deliveries[0].state).toEqual({ kind: "pending" });
        expect(period!.lastRelativeReleaseAt).toEqual(at);
        await recordDripRelease(
            key,
            ["group-1"],
            ["group-1"],
            ["group-1"],
            new Date(at.getTime() + 1000),
        );
        expect((await readPeriod())!.deliveries).toEqual(period!.deliveries);
        expect((await readPeriod())!.lastRelativeReleaseAt).toEqual(at);
    });

    it("lets a racing freeze or grant win atomically and rejects all later releases", async () => {
        const [release, frozen] = await Promise.all([
            recordDripRelease(
                key,
                ["group-1"],
                ["group-1"],
                ["group-1"],
                at,
                0,
            ),
            freezePeriod(),
        ]);
        const after = await readPeriod();
        expect(after!.state.kind).toBe("freezing");
        expect(after!.groupReleases.map((group) => group.groupId)).toEqual(
            release ? ["group-1"] : [],
        );
        expect(after!.revision).toBe(release ? 2 : 1);
        expect(frozen!.groupReleases).toEqual(after!.groupReleases);
        expect(
            await recordDripRelease(key, ["late"], ["late"], ["late"], at),
        ).toBeNull();
        expect(
            await getPendingDripDeliveries(key.domainId, "period-1"),
        ).toEqual([]);
        expect((await readPeriod())!.groupReleases).toEqual(
            after!.groupReleases,
        );
    });

    it("rejects a release sampled before freezing even when its Mongo write resumes later", async () => {
        const original = MembershipAccessModel.findOneAndUpdate.bind(
            MembershipAccessModel,
        );
        let releaseWrite!: () => void;
        let observedWrite!: () => void;
        const paused = new Promise<void>((resolve) => {
            releaseWrite = resolve;
        });
        const observed = new Promise<void>((resolve) => {
            observedWrite = resolve;
        });
        jest.spyOn(
            MembershipAccessModel,
            "findOneAndUpdate",
        ).mockImplementationOnce(((...args: any[]) => ({
            lean: async () => {
                observedWrite();
                await paused;
                return original(
                    ...(args as Parameters<typeof original>),
                ).lean();
            },
        })) as any);
        const release = recordDripRelease(
            key,
            ["late"],
            ["late"],
            ["late"],
            at,
            0,
        );
        await observed;
        await freezePeriod();
        releaseWrite();
        expect(await release).toBeNull();
        expect((await readPeriod())!.groupReleases).toEqual([]);
        expect((await readPeriod())!.deliveries).toEqual([]);
    });

    it("forces stale relative scheduling to recompute instead of using its old anchor", async () => {
        await grant();
        expect(
            await recordDripRelease(
                key,
                ["group-2"],
                ["group-2"],
                ["group-2"],
                at,
                0,
            ),
        ).toBeNull();
        expect(
            (await readPeriod())!.groupReleases.map((group) => group.groupId),
        ).toEqual(["group-1"]);
    });

    it("does not move the relative anchor for exact-date or preexisting releases", async () => {
        await recordDripRelease(key, ["exact"], [], [], at, 0);
        const period = await readPeriod();
        expect(period!.lastRelativeReleaseAt).toBeUndefined();
        expect(period!.deliveries).toEqual([]);
    });

    it.each(["expired", "new-session"])(
        "rereads actual membership before grants, recovery, claims and projection: %s",
        async (change) => {
            const period = await grant();
            await AccessMembershipModel.updateOne(
                { domain: key.domainId, membershipId: key.membershipId },
                {
                    $set:
                        change === "expired"
                            ? { status: Constants.MembershipStatus.EXPIRED }
                            : { sessionId: "rejoin-session" },
                },
            );
            expect(
                await recordDripRelease(key, ["late"], [], [], at),
            ).toBeNull();
            expect(
                await getPendingDripDeliveries(key.domainId, period.id),
            ).toEqual([]);
            expect(
                await claimDelivery(
                    key.domainId,
                    period.id,
                    period.deliveries[0].id,
                ),
            ).toEqual({ kind: "skipped" });
            const update = jest.spyOn(AccessUserModel, "updateOne");
            await projectDripAccess(key);
            expect(update).not.toHaveBeenCalled();
        },
    );

    it("scopes all operations to the tenant and period identity", async () => {
        const period = await grant();
        const otherDomain = new mongoose.Types.ObjectId().toString();
        expect(
            await recordDripRelease(
                { ...key, domainId: otherDomain },
                ["late"],
                [],
                [],
                at,
            ),
        ).toBeNull();
        expect(
            await recordDripRelease(
                { ...key, membershipSessionId: "other" },
                ["late"],
                [],
                [],
                at,
            ),
        ).toBeNull();
        expect(await getPendingDripDeliveries(otherDomain, period.id)).toEqual(
            [],
        );
        expect(
            await claimDelivery(
                otherDomain,
                period.id,
                period.deliveries[0].id,
            ),
        ).toEqual({ kind: "skipped" });
    });
});

describe("durable drip delivery boundary in Mongo", () => {
    it("recovers pending intents without another grant and gives only one worker a claim", async () => {
        const period = await grant();
        const delivery = period.deliveries[0];
        expect(await getPendingDripDeliveries(key.domainId, period.id)).toEqual(
            [delivery],
        );
        const claims = await Promise.all([
            claimDelivery(key.domainId, period.id, delivery.id, at),
            claimDelivery(key.domainId, period.id, delivery.id, at),
        ]);
        expect(claims.filter((claim) => claim.kind === "claimed")).toHaveLength(
            1,
        );
        expect(await getPendingDripDeliveries(key.domainId, period.id)).toEqual(
            [],
        );
        expect(
            await claimDelivery(key.domainId, period.id, delivery.id),
        ).toEqual({ kind: "skipped" });
    });

    it("blocks a pending delivery when cancellation wins before claim", async () => {
        const period = await grant();
        await freezePeriod();
        expect(
            await claimDelivery(
                key.domainId,
                period.id,
                period.deliveries[0].id,
            ),
        ).toEqual({ kind: "skipped" });
        expect((await readPeriod())!.deliveries[0].state.kind).toBe("pending");
    });

    it("uses the same CAS to order racing dispatch and cancellation", async () => {
        const period = await grant();
        const [claim, frozen] = await Promise.all([
            claimDelivery(key.domainId, period.id, period.deliveries[0].id, at),
            freezePeriod(),
        ]);
        expect(frozen!.state.kind).toBe("freezing");
        const state = (await readPeriod())!.deliveries[0].state;
        expect(state.kind).toBe(
            claim.kind === "claimed" ? "dispatching" : "pending",
        );
        expect(
            await claimDelivery(
                key.domainId,
                period.id,
                period.deliveries[0].id,
            ),
        ).toEqual({ kind: "skipped" });
    });

    it.each(["sent", "uncertain"] as const)(
        "records %s after an in-flight send crossed the cancellation boundary, without replay",
        async (outcome) => {
            const period = await grant();
            const deliveryId = period.deliveries[0].id;
            const claim = await claimDelivery(
                key.domainId,
                period.id,
                deliveryId,
                at,
            );
            if (claim.kind !== "claimed") throw new Error("Expected claim");
            await freezePeriod();
            await finishDelivery(
                key.domainId,
                period.id,
                deliveryId,
                "wrong-claim",
                outcome,
                at,
            );
            expect((await readPeriod())!.deliveries[0].state.kind).toBe(
                "dispatching",
            );
            await finishDelivery(
                key.domainId,
                period.id,
                deliveryId,
                claim.claimId,
                outcome,
                at,
            );
            expect((await readPeriod())!.deliveries[0].state.kind).toBe(
                outcome,
            );
            expect(
                await claimDelivery(key.domainId, period.id, deliveryId),
            ).toEqual({ kind: "skipped" });
            expect(
                await getPendingDripDeliveries(key.domainId, period.id),
            ).toEqual([]);
        },
    );
});

describe("recoverable purchase projection", () => {
    it("updates only this tenant/member/course and stops once the period freezes", async () => {
        const otherDomain = new mongoose.Types.ObjectId();
        await AccessUserModel.deleteMany({
            domain: key.domainId,
            userId: key.userId,
        });
        for (const domain of [key.domainId, otherDomain]) {
            await AccessUserModel.create({
                domain,
                userId: key.userId,
                email: "member@example.com",
                purchases: [
                    { courseId: key.courseId, accessibleGroups: ["old"] },
                    {
                        courseId: "other-course",
                        accessibleGroups: ["untouched"],
                    },
                ],
            });
        }
        await grant();
        await projectDripAccess(key);
        const user = await AccessUserModel.findOne({
            domain: key.domainId,
            userId: key.userId,
        }).lean();
        expect(user!.purchases[0].accessibleGroups).toEqual(["group-1"]);
        expect(user!.purchases[0].lastDripAt).toEqual(at);
        expect(user!.purchases[1].accessibleGroups).toEqual(["untouched"]);
        expect(
            (await AccessUserModel.findOne({ domain: otherDomain }).lean())!
                .purchases[0].accessibleGroups,
        ).toEqual(["old"]);
        await freezePeriod();
        const update = jest.spyOn(AccessUserModel, "updateOne");
        await projectDripAccess(key);
        expect(update).not.toHaveBeenCalled();
    });
});

it("suppresses pending mail when the user is disabled or the course is unpublished", async () => {
    const period = await grant();
    await AccessUserModel.updateOne(
        { domain: key.domainId, userId: key.userId },
        { active: false },
    );
    expect(
        await claimDelivery(key.domainId, period.id, period.deliveries[0].id),
    ).toEqual({ kind: "skipped" });
    await AccessUserModel.updateOne(
        { domain: key.domainId, userId: key.userId },
        { active: true },
    );
    await AccessCourseModel.updateOne(
        { domain: key.domainId, courseId: key.courseId },
        { published: false },
    );
    expect(
        await claimDelivery(key.domainId, period.id, period.deliveries[0].id),
    ).toEqual({ kind: "skipped" });
});

describe("approved schedule changes at the grant and delivery boundaries", () => {
    it("declines a sampled schedule after its course revision changes", async () => {
        await AccessCourseModel.updateOne(
            { domain: key.domainId, courseId: key.courseId },
            { $inc: { __v: 1 } },
        );
        expect(
            await recordDripRelease(
                key,
                ["group-1"],
                ["group-1"],
                ["group-1"],
                at,
                0,
                0,
            ),
        ).toBeNull();
        expect((await readPeriod())!.groupReleases).toHaveLength(0);
    });
    it("holds pending mail while disabled and can resume it when enabled", async () => {
        const period = await grant();
        const delivery = period.deliveries[0];
        await AccessCourseModel.updateOne(
            { domain: key.domainId, courseId: key.courseId },
            { $set: { "groups.0.drip.email.published": false } },
        );
        expect(
            await claimDelivery(key.domainId, period.id, delivery.id, at),
        ).toEqual({ kind: "skipped" });
        expect((await readPeriod())!.deliveries[0].state.kind).toBe("pending");
        await AccessCourseModel.updateOne(
            { domain: key.domainId, courseId: key.courseId },
            { $set: { "groups.0.drip.email.published": true } },
        );
        expect(
            (await claimDelivery(key.domainId, period.id, delivery.id, at))
                .kind,
        ).toBe("claimed");
    });
});
