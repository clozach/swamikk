import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { POST } from "../../payment/initiate/route";
import { getPaymentMethodFromSettings } from "@/payments-new";
import { InvoiceModel } from "@/services/member-billing/models";
import { accountClosureReview } from "@/services/account-closure/review";
import { fixture, cleanup } from "../../member-billing/__tests__/fixtures";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/payments-new", () => ({
    getPaymentMethodFromSettings: jest.fn(),
}));
jest.mock("@/services/logger", () => ({ error: jest.fn(), info: jest.fn() }));
let f: Awaited<ReturnType<typeof fixture>>;
let provider: any;
function request() {
    return new NextRequest("https://member.example/api/payment/initiate", {
        method: "POST",
        headers: {
            domain: f.domain.name,
            origin: "https://member.example",
            host: "member.example",
            "content-type": "application/json",
        },
        body: JSON.stringify({
            id: f.member.entityId,
            type: "course",
            planId: f.member.paymentPlanId,
            origin: "https://member.example",
        }),
    });
}
beforeEach(async () => {
    f = await fixture();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: f.user.email },
    });
    provider = {
        name: "stripe",
        validateSubscription: jest.fn(async () => false),
        getCurrencyISOCode: jest.fn(async () => "NZD"),
        initiate: jest.fn(),
    };
    jest.mocked(getPaymentMethodFromSettings).mockResolvedValue(provider);
});
afterEach(cleanup);
it("keeps checkout reserved and a pending native invoice durable before asking the provider", async () => {
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    provider.initiate.mockImplementation(async () => {
        entered();
        await pending;
        return "cs_pending";
    });
    const writing = POST(request());
    await reached;
    const invoicesBeforeProvider = await InvoiceModel.countDocuments({
        domain: f.domain._id,
        status: "pending",
    });
    const closing = await beginAccountClosure({
        domainId: String(f.domain._id),
        userId: f.user.userId,
    });
    release();
    expect((await writing).status).toBe(200);
    expect(invoicesBeforeProvider).toBe(1);
    expect(closing.kind).toBe("pending");
    expect(
        (await accountClosureReview(f.user, f.ctx)).blockers.some(
            (item) => item.kind === "checkout",
        ),
    ).toBe(true);
});
it("retains the pending checkout evidence when provider acknowledgement is lost", async () => {
    provider.initiate.mockRejectedValue(
        new Error("Timeout after possible provider creation"),
    );
    expect((await POST(request())).status).toBe(500);
    expect(
        await InvoiceModel.countDocuments({
            domain: f.domain._id,
            status: "pending",
        }),
    ).toBe(1);
});
