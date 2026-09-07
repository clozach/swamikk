/** @jest-environment node */
jest.mock("@/lib/record-activity", () => ({ recordActivity: jest.fn() }));
jest.mock("@/lib/trigger-sequences", () => ({ triggerSequences: jest.fn() }));
import Domain from "@/models/Domain";
import Sequence from "@/models/Sequence";
import type GQLContext from "@/models/GQLContext";
import { UIConstants } from "@courselit/common-models";
import { updateSequence } from "../logic";

describe("native sequence partial settings", () => {
    let domain: any;
    let ctx: GQLContext;
    const audience = {
        aggregator: "and",
        filters: [{ name: "tag", condition: "includes", value: "members" }],
    };
    async function savedSequence() {
        const document = await Sequence.findOne({ domain: domain._id }).lean();
        expect(document).not.toBeNull();
        return JSON.parse(JSON.stringify(document));
    }
    beforeAll(async () => {
        domain = await Domain.create({
            name: `sequence-settings-${Date.now()}`,
            email: "owner@example.com",
        });
        ctx = {
            subdomain: domain,
            user: {
                userId: "sequence-admin",
                active: true,
                permissions: [UIConstants.permissions.manageUsers],
            },
        } as unknown as GQLContext;
    });
    beforeEach(async () => {
        await Sequence.deleteMany({ domain: domain._id });
        await Sequence.create({
            domain: domain._id,
            sequenceId: "settings-sequence",
            title: "Member welcome",
            type: "sequence",
            creatorId: "sequence-admin",
            from: { name: "Original sender", email: "original@example.com" },
            filter: audience,
            trigger: { type: "product:purchased", data: "member-library" },
            emails: [],
            emailsOrder: [],
        });
    });
    afterAll(async () => {
        await Sequence.deleteMany({ domain: domain._id });
        await Domain.deleteOne({ _id: domain._id });
    });
    it("keeps sender name and email in their separate native fields", async () => {
        await updateSequence({
            ctx,
            sequenceId: "settings-sequence",
            fromName: "Swami Karma Karuna",
            fromEmail: "hello@example.com",
        });
        const saved = await savedSequence();
        expect(saved.from.name).toBe("Swami Karma Karuna");
        expect(saved.from.email).toBe("hello@example.com");
    });
    it("preserves the selected audience when editing only a title", async () => {
        const before = await savedSequence();
        await updateSequence({
            ctx,
            sequenceId: "settings-sequence",
            title: "Welcome",
        });
        const saved = await savedSequence();
        expect(saved.filter).toEqual(before.filter);
        expect(saved.trigger).toEqual(before.trigger);
        expect(saved.from).toEqual(before.from);
    });
    it("changes an email alone without erasing the name and permits an explicit audience clear", async () => {
        await updateSequence({
            ctx,
            sequenceId: "settings-sequence",
            fromEmail: "reply@example.com",
            filter: JSON.stringify({ aggregator: "or", filters: [] }),
        });
        const saved = await savedSequence();
        expect(saved.from.name).toBe("Original sender");
        expect(saved.from.email).toBe("reply@example.com");
        expect(saved.filter).toMatchObject({ aggregator: "or", filters: [] });
    });
});
