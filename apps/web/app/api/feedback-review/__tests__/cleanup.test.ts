import { issueGrant } from "@/services/feedback-review/grants";
import { deleteTenantFeedbackReviewGrants } from "@/services/feedback-review/cleanup";
import { cleanupPersonalData } from "@/graphql/users/helpers";
import { ReviewGrantModel } from "@/services/feedback-review/models";
import { fixture } from "./fixtures";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));

test("ordinary account erasure removes only its issuer grants", async () => {
    const f = await fixture();
    const other = await fixture();
    await cleanupPersonalData(f.user, f.ctx);
    expect(
        await ReviewGrantModel.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
    expect(
        await ReviewGrantModel.countDocuments({ domain: other.domain._id }),
    ).toBe(1);
});

function pause() {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const resumed = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { enter, release, entered, resumed };
}

test("issuer erasure waits for in-flight grant creation, then blocks stale-context recreation", async () => {
    const f = await fixture();
    const waiting = pause();
    const original = ReviewGrantModel.create.bind(ReviewGrantModel);
    const spy = jest
        .spyOn(ReviewGrantModel, "create")
        .mockImplementationOnce((async (...args: any[]) => {
            waiting.enter();
            await waiting.resumed;
            return (original as any)(...args);
        }) as any);
    const input = {
        name: "Paused creation",
        scopes: ["public-page-text"],
        expiresInDays: 1,
    };
    const pending = issueGrant(input, f.ctx);
    await waiting.entered;
    await expect(cleanupPersonalData(f.user, f.ctx)).rejects.toMatchObject({
        code: "account_busy",
    });
    waiting.release();
    await pending;
    spy.mockRestore();
    await cleanupPersonalData(f.user, f.ctx);
    expect(
        await ReviewGrantModel.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
    await expect(issueGrant(input, f.ctx)).rejects.toMatchObject({
        code: "account_unavailable",
    });
});

test("issuer erasure waits for admitted review before deleting its grants", async () => {
    const f = await fixture();
    const waiting = pause();
    const pending = f.use(async () => {
        waiting.enter();
        await waiting.resumed;
    });
    await waiting.entered;
    await expect(cleanupPersonalData(f.user, f.ctx)).rejects.toMatchObject({
        code: "account_busy",
    });
    expect(
        await ReviewGrantModel.countDocuments({ domain: f.domain._id }),
    ).toBe(1);
    waiting.release();
    await pending;
    await cleanupPersonalData(f.user, f.ctx);
    expect(
        await ReviewGrantModel.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
    await expect(f.claim()).rejects.toMatchObject({ code: "unauthorized" });
});

test("offline tenant grant cleanup refuses admitted work and preserves other tenants", async () => {
    const f = await fixture(),
        other = await fixture();
    const waiting = pause();
    const pending = f.use(async () => {
        waiting.enter();
        await waiting.resumed;
    });
    await waiting.entered;
    await expect(
        deleteTenantFeedbackReviewGrants(String(f.domain._id)),
    ).rejects.toMatchObject({ code: "review_busy" });
    expect(
        await ReviewGrantModel.countDocuments({ domain: f.domain._id }),
    ).toBe(1);
    await expect(f.claim()).rejects.toMatchObject({ code: "unauthorized" });
    waiting.release();
    await pending;
    await deleteTenantFeedbackReviewGrants(String(f.domain._id));
    expect(
        await ReviewGrantModel.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
    expect(
        await ReviewGrantModel.countDocuments({ domain: other.domain._id }),
    ).toBe(1);
});
