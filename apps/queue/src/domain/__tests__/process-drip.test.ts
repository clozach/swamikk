/**
 * @jest-environment node
 */

import {
    getNewAccessibleGroupIdsForPurchase,
    processDripPass,
} from "../process-drip";
import { Constants } from "@courselit/common-models";
import CourseModel from "../model/course";
import UserModel from "../model/user";
import * as queries from "../queries";
import mailQueue from "../queue";
import * as posthog from "../../observability/posthog";
import { ensureMembershipAccess } from "../../../../../packages/common-logic/src/member-access/lifecycle";
import {
    recordDripRelease,
    getPendingDripDeliveries,
    projectDripAccess,
} from "../../../../../packages/common-logic/src/member-access/drip";

jest.mock(
    "../../../../../packages/common-logic/src/member-access/lifecycle",
    () => ({ ensureMembershipAccess: jest.fn() }),
);
jest.mock(
    "../../../../../packages/common-logic/src/member-access/drip",
    () => ({
        recordDripRelease: jest.fn(),
        getPendingDripDeliveries: jest.fn(),
        projectDripAccess: jest.fn(),
    }),
);

const DAY_IN_MS = 86_400_000;

jest.mock("../queue", () => ({
    __esModule: true,
    default: {
        add: jest.fn(),
    },
}));

function makeCourse(groups: any[]) {
    return {
        groups,
    } as any;
}

function makeDripGroup({
    id,
    rank,
    drip,
}: {
    id: string;
    rank: number;
    drip: any;
}) {
    return {
        _id: id,
        rank,
        drip,
    } as any;
}

function makePurchase(overrides: Partial<any> = {}) {
    return {
        accessibleGroups: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    } as any;
}

describe("getNewAccessibleGroupIdsForPurchase", () => {
    it("returns empty list when no drip groups are unlockable", () => {
        const nowUTC = new Date("2026-01-02T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "future-exact",
                rank: 1000,
                drip: {
                    status: true,
                    type: "exact-date",
                    dateInUTC: nowUTC + DAY_IN_MS,
                },
            }),
            makeDripGroup({
                id: "disabled",
                rank: 2000,
                drip: {
                    status: false,
                    type: "relative-date",
                    delayInMillis: 0,
                },
            }),
        ]);

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: makePurchase(),
            nowUTC,
        });

        expect(newGroupIds).toEqual([]);
    });

    it("uses _id for exact-date group unlocks", () => {
        const nowUTC = new Date("2026-01-10T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "exact-group-id",
                rank: 1000,
                drip: {
                    status: true,
                    type: "exact-date",
                    dateInUTC: nowUTC - DAY_IN_MS,
                },
            }),
        ]);
        const purchase = makePurchase();

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: purchase,
            nowUTC,
        });

        expect(newGroupIds).toEqual(["exact-group-id"]);
    });

    it("does not unlock exact-date drip groups when dateInUTC is invalid", () => {
        const nowUTC = new Date("2026-01-10T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "invalid-exact",
                rank: 1000,
                drip: {
                    status: true,
                    type: "exact-date",
                    dateInUTC: "invalid-date",
                },
            }),
        ]);

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: makePurchase(),
            nowUTC,
        });

        expect(newGroupIds).toEqual([]);
    });

    it("filters out groups already present in accessibleGroups", () => {
        const nowUTC = new Date("2026-01-10T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "already-there",
                rank: 1000,
                drip: {
                    status: true,
                    type: "exact-date",
                    dateInUTC: nowUTC - DAY_IN_MS,
                },
            }),
        ]);

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: makePurchase({
                accessibleGroups: ["already-there"],
            }),
            nowUTC,
        });

        expect(newGroupIds).toEqual([]);
    });

    it("uses lastDripAt as the relative drip anchor when available", () => {
        const nowUTC = new Date("2026-01-08T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "relative-1",
                rank: 1000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 2 * DAY_IN_MS,
                },
            }),
        ]);

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: makePurchase({
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                lastDripAt: new Date("2026-01-06T00:00:00.000Z"),
            }),
            nowUTC,
        });

        expect(newGroupIds).toEqual(["relative-1"]);
    });

    it("returns only exact-date groups when purchase anchor dates are missing", () => {
        const nowUTC = new Date("2026-01-10T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "exact-1",
                rank: 1000,
                drip: {
                    status: true,
                    type: "exact-date",
                    dateInUTC: nowUTC - DAY_IN_MS,
                },
            }),
            makeDripGroup({
                id: "relative-1",
                rank: 2000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 0,
                },
            }),
        ]);

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: {
                accessibleGroups: [],
            } as any,
            nowUTC,
        });

        expect(newGroupIds).toEqual(["exact-1"]);
    });

    it("releases relative groups sequentially instead of unlocking all groups at once", () => {
        const nowUTC = new Date("2026-01-04T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "group-1",
                rank: 1000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 2 * DAY_IN_MS,
                },
            }),
            makeDripGroup({
                id: "group-2",
                rank: 2000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 2 * DAY_IN_MS,
                },
            }),
        ]);
        const purchase = makePurchase();

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: purchase,
            nowUTC,
        });

        expect(newGroupIds).toEqual(["group-1"]);
    });

    it("evaluates relative drip groups by rank even when input order is unsorted", () => {
        const nowUTC = new Date("2026-01-03T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "group-rank-2000",
                rank: 2000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 1 * DAY_IN_MS,
                },
            }),
            makeDripGroup({
                id: "group-rank-1000",
                rank: 1000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 1 * DAY_IN_MS,
                },
            }),
        ]);

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: makePurchase(),
            nowUTC,
        });

        expect(newGroupIds).toEqual(["group-rank-1000", "group-rank-2000"]);
    });

    it("does not unlock later relative groups before an earlier group in the sequence", () => {
        const nowUTC = new Date("2026-01-03T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "group-early",
                rank: 1000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 10 * DAY_IN_MS,
                },
            }),
            makeDripGroup({
                id: "group-late",
                rank: 2000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 1 * DAY_IN_MS,
                },
            }),
        ]);
        const purchase = makePurchase();

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: purchase,
            nowUTC,
        });

        expect(newGroupIds).toEqual([]);
    });

    it("supports relative drips with 0-day delay", () => {
        const nowUTC = new Date("2026-01-01T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "instant-relative",
                rank: 1000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 0,
                },
            }),
        ]);

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: makePurchase(),
            nowUTC,
        });

        expect(newGroupIds).toEqual(["instant-relative"]);
    });

    it("stops evaluating relative groups after encountering a negative delay", () => {
        const nowUTC = new Date("2026-01-10T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "bad-group",
                rank: 1000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: -1,
                },
            }),
            makeDripGroup({
                id: "next-group",
                rank: 2000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 0,
                },
            }),
        ]);

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: makePurchase(),
            nowUTC,
        });

        expect(newGroupIds).toEqual([]);
    });

    it("combines exact-date and relative unlocks without duplicates", () => {
        const nowUTC = new Date("2026-01-03T00:00:00.000Z").getTime();
        const course = makeCourse([
            makeDripGroup({
                id: "shared-group",
                rank: 1000,
                drip: {
                    status: true,
                    type: "exact-date",
                    dateInUTC: nowUTC - DAY_IN_MS,
                },
            }),
            makeDripGroup({
                id: "relative-group",
                rank: 2000,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: DAY_IN_MS,
                },
            }),
        ]);

        const newGroupIds = getNewAccessibleGroupIdsForPurchase({
            course,
            userProgressInCourse: makePurchase({
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
            }),
            nowUTC,
        });

        expect(newGroupIds).toEqual(["shared-group", "relative-group"]);
    });
});
describe("processDripPass", () => {
    const now = new Date("2026-01-10T00:00:00.000Z");
    let period: any;
    let course: any;
    let user: any;
    beforeEach(() => {
        jest.clearAllMocks();
        period = {
            id: "period-1",
            domainId: "domain-1",
            userId: "user-1",
            courseId: "course-1",
            membershipId: "membership-1",
            membershipSessionId: "session-1",
            start: {
                kind: "recorded",
                at: new Date("2026-01-01T00:00:00.000Z"),
            },
            state: { kind: "active" },
            groupReleases: [],
            deliveries: [],
            revision: 4,
        };
        course = {
            courseId: "course-1",
            creatorId: "creator-1",
            domain: "domain-1",
            slug: "course-1",
            title: "Course One",
            groups: [
                makeDripGroup({
                    id: "group-1",
                    rank: 1000,
                    drip: {
                        status: true,
                        type: "relative-date",
                        delayInMillis: DAY_IN_MS,
                        email: {
                            published: true,
                            subject: "Section unlocked",
                            content: {
                                content: [
                                    {
                                        blockType: "text",
                                        settings: {
                                            content: "Hi {{ subscriber.name }}",
                                        },
                                    },
                                ],
                            },
                        },
                    },
                }),
            ],
        };
        user = {
            userId: "user-1",
            email: "user@example.com",
            name: "Student",
            tags: [],
            unsubscribeToken: "token-1",
            purchases: [
                {
                    courseId: "course-1",
                    accessibleGroups: ["stale-group"],
                    createdAt: new Date("2025-01-01"),
                    lastDripAt: new Date("2025-01-02"),
                },
            ],
        };
        jest.spyOn(CourseModel, "findOne").mockImplementation(
            () => ({ lean: jest.fn().mockResolvedValue(course) }) as any,
        );
        jest.spyOn(CourseModel, "find").mockReturnValue({
            lean: jest.fn().mockResolvedValue([course]),
        } as any);
        jest.spyOn(UserModel, "findOne").mockImplementation(
            (query: any) =>
                ({
                    lean: jest.fn().mockResolvedValue(
                        query.userId === "creator-1"
                            ? {
                                  name: "Creator",
                                  email: "creator@example.com",
                              }
                            : user,
                    ),
                }) as any,
        );
        jest.spyOn(queries, "getMemberships").mockResolvedValue([
            { userId: "user-1", membershipId: "membership-1" },
        ] as any);
        jest.spyOn(queries, "getDomain").mockResolvedValue({
            name: "example",
            settings: { mailingAddress: "Main street" },
        } as any);
        jest.spyOn(posthog, "captureError").mockImplementation(() => undefined);
        jest.mocked(ensureMembershipAccess).mockImplementation(
            async () => period,
        );
        jest.mocked(recordDripRelease).mockImplementation(async () => period);
        jest.mocked(projectDripAccess).mockResolvedValue(undefined);
        jest.mocked(getPendingDripDeliveries).mockResolvedValue([
            {
                id: "delivery-1",
                groupId: "group-1",
                createdAt: now,
                state: { kind: "pending" },
            },
        ]);
    });
    afterEach(() => jest.restoreAllMocks());

    it("commits with the sampled revision, then queues a period-bound delivery", async () => {
        await processDripPass(now);
        expect(queries.getMemberships).toHaveBeenCalledWith(
            "course-1",
            Constants.MembershipEntityType.COURSE,
            "domain-1",
        );
        expect(UserModel.findOne).toHaveBeenCalledWith({
            domain: "domain-1",
            userId: "user-1",
            active: true,
        });
        expect(recordDripRelease).toHaveBeenCalledWith(
            period,
            ["group-1"],
            ["group-1"],
            ["group-1"],
            now,
            4,
            0,
        );
        expect(projectDripAccess).toHaveBeenCalledWith(period);
        expect(mailQueue.add).toHaveBeenCalledWith(
            "mail",
            expect.objectContaining({
                to: user.email,
                subject: "Section unlocked",
                domainId: "domain-1",
                drip: { periodId: "period-1", deliveryId: "delivery-1" },
            }),
            {
                jobId: "drip-period-1-delivery-1",
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
    });

    it("uses the current period start rather than an old purchase on rejoin", async () => {
        period.start.at = now;
        jest.mocked(getPendingDripDeliveries).mockResolvedValue([]);
        await processDripPass(now);
        expect(recordDripRelease).not.toHaveBeenCalled();
    });

    it("uses ledger releases and the latest relative anchor instead of stale purchases", async () => {
        user.purchases[0].accessibleGroups = ["group-1"];
        period.lastRelativeReleaseAt = now;
        await processDripPass(now);
        expect(recordDripRelease).not.toHaveBeenCalled();
        period.lastRelativeReleaseAt = new Date(now.getTime() - DAY_IN_MS);
        await processDripPass(now);
        expect(recordDripRelease).toHaveBeenCalledWith(
            period,
            ["group-1"],
            expect.any(Array),
            expect.any(Array),
            now,
            4,
            0,
        );
    });

    it("preserves the legacy scheduling anchor without inventing a recorded start", async () => {
        period.start = { kind: "legacy-unknown" };
        await processDripPass(now);
        expect(recordDripRelease).toHaveBeenCalled();
        expect(period.start).toEqual({ kind: "legacy-unknown" });
    });

    it("recovers pending mail even when every group was already released", async () => {
        period.groupReleases = [{ kind: "drip", groupId: "group-1", at: now }];
        await processDripPass(now);
        expect(recordDripRelease).not.toHaveBeenCalled();
        expect(projectDripAccess).toHaveBeenCalled();
        expect(mailQueue.add).toHaveBeenCalledTimes(1);
    });

    it("leaves stale or cancelled grants for a fresh pass without projecting or mailing", async () => {
        jest.mocked(recordDripRelease).mockResolvedValue(null);
        await processDripPass(now);
        expect(projectDripAccess).not.toHaveBeenCalled();
        expect(getPendingDripDeliveries).not.toHaveBeenCalled();
        expect(mailQueue.add).not.toHaveBeenCalled();
    });

    it("does not revive an ended period even when a membership was sampled active", async () => {
        period.state = { kind: "ended" };
        await processDripPass(now);
        expect(recordDripRelease).not.toHaveBeenCalled();
        expect(projectDripAccess).not.toHaveBeenCalled();
        expect(mailQueue.add).not.toHaveBeenCalled();
    });

    it("keeps email optional and skips pending groups whose email was removed", async () => {
        delete course.groups[0].drip.email;
        await processDripPass(now);
        expect(recordDripRelease).toHaveBeenCalledWith(
            period,
            ["group-1"],
            ["group-1"],
            [],
            now,
            4,
            0,
        );
        expect(mailQueue.add).not.toHaveBeenCalled();
    });

    it("continues other memberships when one membership changes during processing", async () => {
        jest.spyOn(queries, "getMemberships").mockResolvedValue([
            { userId: "user-1", membershipId: "membership-1" },
            { userId: "user-2", membershipId: "membership-2" },
        ] as any);
        jest.mocked(ensureMembershipAccess).mockRejectedValueOnce(
            new Error("membership ended"),
        );
        await processDripPass(now);
        expect(posthog.captureError).toHaveBeenCalledWith(
            expect.objectContaining({ source: "processDrip.membership" }),
        );
        expect(ensureMembershipAccess).toHaveBeenCalledTimes(2);
        expect(mailQueue.add).toHaveBeenCalledTimes(1);
    });
});
