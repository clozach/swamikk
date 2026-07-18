/**
 * @jest-environment node
 */

import { getSubscribers } from "../logic";
import { UIConstants } from "@courselit/common-models";
import GQLContext from "@/models/GQLContext";
import { responses } from "@/config/strings";

const { permissions } = UIConstants;

function makeCtx(perms: string[]): GQLContext {
    return {
        subdomain: { _id: "domain-oid", name: "acme" },
        user: { userId: "admin", permissions: perms },
    } as unknown as GQLContext;
}

describe("getSubscribers", () => {
    it("rejects a manageMedia-only caller (subscriber emails are PII)", async () => {
        // auth.ts grants manageMedia to every signup so members can attach
        // images to community posts. That must not open the subscriber roster.
        const deps = { listSubscribers: jest.fn() };
        await expect(
            getSubscribers(makeCtx([permissions.manageMedia]), {}, deps as any),
        ).rejects.toThrow(responses.action_not_allowed);
        expect(deps.listSubscribers).not.toHaveBeenCalled();
    });

    it("rejects an anonymous (unauthenticated) caller", async () => {
        const deps = { listSubscribers: jest.fn() };
        await expect(
            getSubscribers(
                { subdomain: { _id: "domain-oid" }, user: null } as any,
                {},
                deps as any,
            ),
        ).rejects.toThrow(responses.request_not_authenticated);
        expect(deps.listSubscribers).not.toHaveBeenCalled();
    });

    it("scopes to the tenant with default paging for a manageUsers caller", async () => {
        const deps = { listSubscribers: jest.fn().mockResolvedValue([]) };
        await getSubscribers(
            makeCtx([permissions.manageUsers]),
            {},
            deps as any,
        );
        expect(deps.listSubscribers).toHaveBeenCalledWith("domain-oid", 1, 50);
    });

    it("passes page and limit through when provided", async () => {
        const deps = { listSubscribers: jest.fn().mockResolvedValue([]) };
        await getSubscribers(
            makeCtx([permissions.manageUsers]),
            { page: 3, limit: 25 },
            deps as any,
        );
        expect(deps.listSubscribers).toHaveBeenCalledWith("domain-oid", 3, 25);
    });

    it("shapes each row: userId, email, name, and createdAt -> subscribedAt ISO", async () => {
        const subscribedAt = new Date("2026-01-15T09:30:00.000Z");
        const deps = {
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

        const result = await getSubscribers(
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
            },
            {
                userId: "u-nameless",
                email: "nameless@example.com",
                name: undefined,
                subscribedAt: "2026-01-15T09:30:00.000Z",
            },
        ]);
    });

    it("leaves subscribedAt undefined when the row has no timestamp", async () => {
        const deps = {
            listSubscribers: jest
                .fn()
                .mockResolvedValue([
                    { userId: "u-old", email: "old@example.com" },
                ]),
        };

        const result = await getSubscribers(
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
            },
        ]);
    });
});
