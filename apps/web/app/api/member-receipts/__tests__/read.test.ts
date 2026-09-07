import { NextRequest } from "next/server";
import { GET } from "../[invoiceId]/route";
import { auth } from "@/auth";
import * as mimic from "@/services/member-mimic/context";
import { fixture, cleanup } from "../../member-billing/__tests__/fixtures";
import {
    InvoiceModel,
    MembershipModel,
} from "@/services/member-billing/models";
import { MembershipAccessModel } from "../../../../../../packages/common-logic/src/member-access/models";
import { readMemberReceipt } from "@/services/member-receipts/read";
import BillingCancellation from "@/models/BillingCancellation";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
let f: Awaited<ReturnType<typeof fixture>>;
let invoiceId: string;
beforeEach(async () => {
    f = await fixture();
    invoiceId = (await InvoiceModel.findOne({ domain: f.domain._id }).orFail())
        .invoiceId;
    jest.mocked(auth.api.getSession).mockResolvedValue({
        user: { email: f.user.email },
    } as any);
});
afterEach(async () => {
    jest.restoreAllMocks();
    await cleanup();
});
const request = () =>
    new NextRequest(`https://member.example/api/member-receipts/${invoiceId}`, {
        headers: { domain: f.domain.name, host: "member.example" },
    });
const params = () => ({ params: Promise.resolve({ invoiceId }) });

it("reads a historical owned receipt without changing payment or membership/access records", async () => {
    await MembershipModel.updateOne(
        { _id: f.member._id },
        { $set: { sessionId: "rejoined" } },
    );
    const snapshot = async () =>
        JSON.stringify(
            await Promise.all([
                InvoiceModel.find({}).lean(),
                MembershipModel.find({}).lean(),
                MembershipAccessModel.find({}).lean(),
                BillingCancellation.find({}).lean(),
            ]),
        );
    const before = await snapshot();
    const result = await GET(request(), params());
    const body = await result.json();
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
        invoiceId,
        productName: "Practice library",
        amount: 50,
        currency: "NZD",
        mode: "test",
        settlement: { kind: "unrecorded" },
        readOnly: false,
    });
    expect(JSON.stringify(body)).not.toMatch(
        /sub_monthly|cus_member|ch_current|in_current|stripeSecret|membershipSessionId|paymentProcessor/,
    );
    expect(await snapshot()).toBe(before);
});
it("preserves payment-date provenance instead of substituting local creation time", async () => {
    const at = new Date("2026-09-06T03:04:05Z");
    await InvoiceModel.updateOne(
        { invoiceId },
        { $set: { settlement: { at, source: "stripe-checkout-confirmed" } } },
    );
    const receipt = await readMemberReceipt(f.ctx, invoiceId);
    expect(receipt.settlement).toEqual({
        kind: "recorded",
        at: at.toISOString(),
        source: "stripe-checkout-confirmed",
    });
});
it("rejects anonymous, foreign member, another tenant and unpaid receipts", async () => {
    jest.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    expect((await GET(request(), params())).status).toBe(401);
    await expect(
        readMemberReceipt(
            {
                ...f.ctx,
                user: { ...f.user.toObject(), userId: "someone-else" },
            },
            invoiceId,
        ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
        readMemberReceipt(
            {
                ...f.ctx,
                subdomain: {
                    ...f.ctx.subdomain,
                    _id: "507f1f77bcf86cd799439011",
                } as any,
            },
            invoiceId,
        ),
    ).rejects.toMatchObject({ status: 401 });
    await InvoiceModel.updateOne(
        { invoiceId },
        { $set: { status: "pending" } },
    );
    expect((await GET(request(), params())).status).toBe(404);
});
it("uses the approved Mimic subject and refuses an expired context", async () => {
    const resolve = jest.spyOn(mimic, "resolveMemberReadContext");
    resolve.mockResolvedValueOnce({
        kind: "mimic",
        context: { ...f.ctx, memberMimic: { subjectUserId: f.user.userId } },
        view: {},
    } as any);
    const response = await GET(request(), params());
    expect((await response.json()).readOnly).toBe(true);
    resolve.mockResolvedValueOnce({ kind: "expired", view: {} } as any);
    expect((await GET(request(), params())).status).toBe(403);
});
