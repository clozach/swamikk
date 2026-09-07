import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { GET as reviewGET, POST as reviewPOST } from "../review/route";
import { auth } from "@/auth";
import * as mimic from "@/services/member-mimic/context";
import { MEMBER_MIMIC_COOKIE } from "@/services/member-mimic/constants";
import * as preparation from "@/services/refund-requests/review";
import RefundRequest from "@/models/RefundRequest";
import { fixture, cleanup } from "../../member-billing/__tests__/fixtures";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
let f: Awaited<ReturnType<typeof fixture>>;
const session = auth.api.getSession as unknown as jest.Mock;
beforeEach(async () => {
    f = await fixture();
    session.mockResolvedValue({ user: { email: f.user.email } });
});
afterEach(async () => {
    await RefundRequest.deleteMany({});
    await cleanup();
});
function req(
    method = "GET",
    extra: Record<string, string> = {},
    body: unknown = {
        action: "prepare",
        invoiceId: "paid-receipt",
        reason: "Please review",
    },
) {
    return new NextRequest("https://member.example/api/refund-requests", {
        method,
        headers: {
            domain: f.domain.name,
            host: "member.example",
            origin: "https://member.example",
            "content-type": "application/json",
            ...extra,
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    });
}
it("requires a tenant session and protects the private review queue with payment permission", async () => {
    session.mockResolvedValueOnce(null);
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("GET", { domain: "other" }))).status).toBe(404);
    expect((await reviewGET(req())).status).toBe(403);
    expect(
        (
            await reviewPOST(
                req("POST", {}, { action: "review", requestId: "other" }),
            )
        ).status,
    ).toBe(403);
});
it("rejects cross-origin, non-JSON and any Mimic POST before saving or reading provider data", async () => {
    const prepare = jest.spyOn(preparation, "prepareRefundRequest");
    for (const route of [POST, reviewPOST]) {
        expect(
            (await route(req("POST", { origin: "https://other.example" })))
                .status,
        ).toBe(403);
        expect(
            (await route(req("POST", { "sec-fetch-site": "cross-site" })))
                .status,
        ).toBe(403);
        expect(
            (await route(req("POST", { "content-type": "text/plain" }))).status,
        ).toBe(415);
        expect(
            (
                await route(
                    req("POST", { cookie: `${MEMBER_MIMIC_COOKIE}=expired` }),
                )
            ).status,
        ).toBe(403);
    }
    expect(prepare).not.toHaveBeenCalled();
    expect(await RefundRequest.countDocuments()).toBe(0);
});
it("accepts text-only strict commands, with no provider IDs or invented class dates", async () => {
    const result = await POST(
        req(
            "POST",
            {},
            {
                action: "prepare",
                invoiceId: "invoice",
                reason: "Please review",
                chargeId: "ch_browser",
            },
        ),
    );
    expect(result.status).toBe(400);
    expect(
        (
            await POST(
                req(
                    "POST",
                    {},
                    {
                        action: "prepare",
                        invoiceId: "invoice",
                        reason: "Please review",
                        photoMediaIds: ["private"],
                    },
                ),
            )
        ).status,
    ).toBe(400);
    expect(
        (
            await reviewPOST(
                req(
                    "POST",
                    {},
                    {
                        action: "verify-class",
                        invoiceId: "invoice",
                        cohortId: "class",
                        explanation: "Checked",
                        bookingVerified: true,
                        startAt: "2027-01-01",
                    },
                ),
            )
        ).status,
    ).toBe(400);
    expect(await RefundRequest.countDocuments()).toBe(0);
});
it("returns only a safe Mimic subject projection and denies an expired context or operator queue", async () => {
    const resolve = jest.spyOn(mimic, "resolveMemberReadContext");
    resolve.mockResolvedValueOnce({
        kind: "mimic",
        context: { ...f.ctx, memberMimic: { subjectUserId: f.user.userId } },
        view: {},
    } as any);
    const result = await GET(req());
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    const view = await result.json();
    expect(view).toMatchObject({
        readOnly: true,
        products: [{ productName: "Practice library" }],
    });
    expect(JSON.stringify(view)).not.toMatch(
        /sub_monthly|cus_member|stripeSecret|in_current/,
    );
    resolve.mockResolvedValueOnce({ kind: "expired", view: {} } as any);
    expect((await GET(req())).status).toBe(403);
    expect(
        (
            await reviewGET(
                req("GET", { cookie: `${MEMBER_MIMIC_COOKIE}=active` }),
            )
        ).status,
    ).toBe(403);
});
