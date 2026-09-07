import { randomUUID } from "crypto";
import Domain from "@/models/Domain";
import User from "@/models/User";
import { FeedbackModel } from "@/services/content-changes/models";
import { createFeedback } from "@/services/content-changes/feedback";
import { deleteUserFeedback } from "@/services/content-changes/personal-data";
import RefundRequest from "@/models/RefundRequest";
import { prepareRefundRequest } from "@/services/refund-requests/review";
import { fixture } from "../../member-billing/__tests__/fixtures";
import { createDiscussionComment } from "@/graphql/product-discussions/logic";
import DiscussionComment from "@/models/ProductDiscussionComment";
import {
    beginAccountClosure,
    requireAccountErasureReady,
} from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { deleteUserRefundDrafts } from "@/services/refund-requests/cleanup";
import { withGraphqlAccountWrites } from "@/services/account-closure/graphql-write";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/graphql/lessons/logic", () => ({
    getLessonDetails: jest.fn(async () => ({})),
    getLessonOrThrow: jest.fn(async () => ({})),
}));
jest.mock("@/lib/record-activity", () => ({ recordActivity: jest.fn() }));
jest.mock("@/lib/assert-rate-limit", () => ({ assertRateLimit: jest.fn() }));
jest.mock("@/graphql/product-discussions/helpers", () => ({
    ...jest.requireActual("@/graphql/product-discussions/helpers"),
    validateDiscussionTargetForLearner: jest.fn(async () => ({
        product: { title: "Practice", creatorId: "teacher" },
    })),
}));

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
function pauseCreate(model: any) {
    const entered = deferred(),
        release = deferred();
    const create = model.create.bind(model);
    jest.spyOn(model, "create").mockImplementationOnce(async (...args) => {
        entered.resolve();
        await release.promise;
        return create(...args);
    });
    return { entered: entered.promise, release: release.resolve };
}
async function memberFixture() {
    const id = randomUUID();
    const domain = await Domain.create({
        name: id,
        email: `owner-${id}@example.com`,
    });
    const user = await User.create({
        domain: domain._id,
        userId: id,
        email: `${id}@example.com`,
        active: true,
    });
    return {
        domain,
        user,
        ctx: {
            subdomain: domain,
            user,
            address: "https://school.example",
        } as any,
    };
}
afterEach(() => jest.restoreAllMocks());

it("does not recreate member feedback after account erasure starts", async () => {
    const f = await memberFixture(),
        pause = pauseCreate(FeedbackModel);
    const writing = createFeedback(
        {
            text: "Private support note",
            target: { kind: "page", path: "/products", componentId: "main" },
        },
        f.ctx,
    );
    await pause.entered;
    expect(
        (
            await beginAccountClosure({
                domainId: String(f.domain._id),
                userId: f.user.userId,
            })
        ).kind,
    ).toBe("pending");
    await expect(
        deleteUserFeedback(String(f.domain._id), f.user.userId),
    ).rejects.toMatchObject({ code: "account_busy" });
    pause.release();
    await writing;
    await User.updateOne({ _id: f.user._id }, { $set: { active: false } });
    await deleteUserFeedback(String(f.domain._id), f.user.userId);
    expect(
        await FeedbackModel.countDocuments({
            domain: f.domain._id,
            "actor.userId": f.user.userId,
        }),
    ).toBe(0);
});

it("does not recreate an unsubmitted refund reason after account erasure starts", async () => {
    const f = await fixture(),
        pause = pauseCreate(RefundRequest);
    const invoice = await (
        await import("@/models/Invoice")
    ).default.findOne({ domain: f.domain._id });
    const writing = prepareRefundRequest(
        f.ctx,
        { invoiceId: invoice.invoiceId, reason: "Private refund draft" },
        {
            now: () => f.now,
            client: jest.fn(async () => {
                throw new Error("No provider in this test");
            }),
        },
    );
    await pause.entered;
    expect(
        (
            await beginAccountClosure({
                domainId: String(f.domain._id),
                userId: f.user.userId,
            })
        ).kind,
    ).toBe("pending");
    await expect(
        deleteUserRefundDrafts(String(f.domain._id), f.user.userId),
    ).rejects.toMatchObject({ code: "account_busy" });
    pause.release();
    await writing;
    await User.updateOne({ _id: f.user._id }, { $set: { active: false } });
    await deleteUserRefundDrafts(String(f.domain._id), f.user.userId);
    expect(
        await RefundRequest.countDocuments({
            domain: f.domain._id,
            userId: f.user.userId,
        }),
    ).toBe(0);
});

it("does not recreate a native discussion comment after account erasure starts", async () => {
    const f = await memberFixture(),
        pause = pauseCreate(DiscussionComment);
    const writing = withGraphqlAccountWrites(
        { source: "mutation { createDiscussionComment }", ctx: f.ctx },
        () =>
            createDiscussionComment({
                ctx: f.ctx,
                productId: "practice",
                entityType: "lesson",
                entityId: "lesson",
                content: {
                    type: "doc",
                    content: [
                        {
                            type: "paragraph",
                            content: [
                                { type: "text", text: "Private practice note" },
                            ],
                        },
                    ],
                },
            }),
    );
    await pause.entered;
    expect(
        (
            await beginAccountClosure({
                domainId: String(f.domain._id),
                userId: f.user.userId,
            })
        ).kind,
    ).toBe("pending");
    await expect(
        requireAccountErasureReady({
            domainId: String(f.domain._id),
            userId: f.user.userId,
        }),
    ).rejects.toMatchObject({ code: "account_busy" });
    pause.release();
    await writing;
    await User.updateOne({ _id: f.user._id }, { $set: { active: false } });
    await DiscussionComment.deleteMany({
        domain: f.domain._id,
        userId: f.user.userId,
    });
    expect(
        await DiscussionComment.countDocuments({
            domain: f.domain._id,
            userId: f.user.userId,
        }),
    ).toBe(0);
});
