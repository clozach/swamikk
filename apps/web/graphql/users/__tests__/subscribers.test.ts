/**
 * @jest-environment node
 */

import { getNewsletterSubscribers } from "../logic";
import { UIConstants } from "@courselit/common-models";
import GQLContext from "@/models/GQLContext";
import { responses } from "@/config/strings";
import mongoose from "mongoose";
import UserModel from "@/models/User";
import MembershipModel from "@/models/Membership";
import { linkedMemberIds } from "@/services/member-mimic/member-links";

const { permissions } = UIConstants;

function makeCtx(perms: string[]): GQLContext {
    return {
        subdomain: { _id: "domain-oid", name: "acme" },
        user: { userId: "admin", permissions: perms },
    } as unknown as GQLContext;
}

describe("getNewsletterSubscribers", () => {
    it("rejects a manageMedia-only caller (subscriber emails are PII)", async () => {
        // auth.ts grants manageMedia to every signup so members can attach
        // images to community posts. That must not open the subscriber roster.
        const deps = { listSubscribers: jest.fn() };
        await expect(
            getNewsletterSubscribers(
                makeCtx([permissions.manageMedia]),
                {},
                deps as any,
            ),
        ).rejects.toThrow(responses.action_not_allowed);
        expect(deps.listSubscribers).not.toHaveBeenCalled();
    });

    it("rejects an anonymous (unauthenticated) caller", async () => {
        const deps = { listSubscribers: jest.fn() };
        await expect(
            getNewsletterSubscribers(
                { subdomain: { _id: "domain-oid" }, user: null } as any,
                {},
                deps as any,
            ),
        ).rejects.toThrow(responses.request_not_authenticated);
        expect(deps.listSubscribers).not.toHaveBeenCalled();
    });

    it("scopes to the tenant with default paging for a manageUsers caller", async () => {
        const deps = {
            listSubscribers: jest.fn().mockResolvedValue([]),
            linkedMemberIds: jest.fn().mockResolvedValue(new Set()),
        };
        await getNewsletterSubscribers(
            makeCtx([permissions.manageUsers]),
            {},
            deps as any,
        );
        expect(deps.listSubscribers).toHaveBeenCalledWith("domain-oid", 1, 50);
    });

    it("passes page and limit through when provided", async () => {
        const deps = {
            listSubscribers: jest.fn().mockResolvedValue([]),
            linkedMemberIds: jest.fn().mockResolvedValue(new Set()),
        };
        await getNewsletterSubscribers(
            makeCtx([permissions.manageUsers]),
            { page: 3, limit: 25 },
            deps as any,
        );
        expect(deps.listSubscribers).toHaveBeenCalledWith("domain-oid", 3, 25);
    });

    it("shapes each row: userId, email, name, and createdAt -> subscribedAt ISO", async () => {
        const subscribedAt = new Date("2026-01-15T09:30:00.000Z");
        const deps = {
            linkedMemberIds: jest.fn().mockResolvedValue(new Set(["u-swami"])),
            listSubscribers: jest.fn().mockResolvedValue([
                {
                    userId: "u-swami",
                    email: "swami@example.com",
                    name: "Swami Karma Karuna",
                    createdAt: subscribedAt,
                },
                {
                    userId: "u-nameless",
                    email: "nameless@example.com",
                    createdAt: subscribedAt,
                },
            ]),
        };

        const result = await getNewsletterSubscribers(
            makeCtx([permissions.manageUsers]),
            {},
            deps as any,
        );

        expect(result).toEqual([
            {
                userId: "u-swami",
                email: "swami@example.com",
                name: "Swami Karma Karuna",
                subscribedAt: "2026-01-15T09:30:00.000Z",
                linkedMemberId: "u-swami",
            },
            {
                userId: "u-nameless",
                email: "nameless@example.com",
                name: undefined,
                subscribedAt: "2026-01-15T09:30:00.000Z",
                linkedMemberId: null,
            },
        ]);
    });

    it("leaves subscribedAt undefined when the row has no timestamp", async () => {
        const deps = {
            linkedMemberIds: jest.fn().mockResolvedValue(new Set()),
            listSubscribers: jest
                .fn()
                .mockResolvedValue([
                    { userId: "u-old", email: "old@example.com" },
                ]),
        };

        const result = await getNewsletterSubscribers(
            makeCtx([permissions.manageUsers]),
            {},
            deps as any,
        );

        expect(result).toEqual([
            {
                userId: "u-old",
                email: "old@example.com",
                name: undefined,
                subscribedAt: undefined,
                linkedMemberId: null,
            },
        ]);
    });
});

describe("subscriber member links use current tenant/account evidence", () => {
    it("distinguishes verified accounts and historic members from anonymous leads, inactive users and foreign evidence", async () => {
        const domain = new mongoose.Types.ObjectId();
        const otherDomain = new mongoose.Types.ObjectId();
        const ids = [
            "verified",
            "enrolled",
            "ended",
            "newsletter",
            "inactive",
            "foreign",
            "pending",
            "deleted",
        ];
        try {
            await UserModel.collection.insertMany(
                ids
                    .filter((id) => id !== "deleted")
                    .map((userId) => ({
                        domain,
                        userId,
                        email: `${userId}@${domain}.example`,
                        active: userId !== "inactive",
                        emailVerified:
                            userId === "verified" || userId === "inactive",
                        subscribedToUpdates: true,
                    })),
            );
            await MembershipModel.collection.insertMany(
                [
                    { userId: "enrolled", domain, status: "active" },
                    { userId: "ended", domain, status: "expired" },
                    { userId: "pending", domain, status: "pending" },
                    {
                        userId: "foreign",
                        domain: otherDomain,
                        status: "active",
                    },
                    { userId: "deleted", domain, status: "active" },
                ].map((row, index) => ({
                    ...row,
                    membershipId: `${domain}-${index}`,
                    entityId: "course",
                    entityType: "course",
                    sessionId: "session",
                    paymentPlanId: "plan",
                })),
            );
            expect(
                Array.from(await linkedMemberIds(domain, ids)).sort(),
            ).toEqual(["ended", "enrolled", "verified"]);
            const ctx = {
                ...makeCtx([permissions.manageUsers]),
                subdomain: { _id: domain },
            } as GQLContext;
            const rows = await getNewsletterSubscribers(ctx, {});
            expect(
                rows
                    .filter((row) => row.linkedMemberId)
                    .map((row) => row.linkedMemberId)
                    .sort(),
            ).toEqual(["ended", "enrolled", "verified"]);
            expect(
                rows.find((row) => row.userId === "newsletter")?.linkedMemberId,
            ).toBeNull();
            expect(await UserModel.countDocuments({ domain })).toBe(7);
            expect(await MembershipModel.countDocuments({ domain })).toBe(4);
        } finally {
            await UserModel.deleteMany({ domain });
            await MembershipModel.deleteMany({
                domain: { $in: [domain, otherDomain] },
            });
        }
    });
});
