import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { auth } from "@/auth";
import * as mimic from "@/services/member-mimic/context";
import { MEMBER_MIMIC_COOKIE } from "@/services/member-mimic/constants";
import * as preparation from "@/services/member-billing/prepare";
import { fixture, cleanup } from "./fixtures";
import BillingCancellation from "@/models/BillingCancellation";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
let f: Awaited<ReturnType<typeof fixture>>;
const session = auth.api.getSession as unknown as jest.Mock;
beforeEach(async () => {
    f = await fixture();
    session.mockResolvedValue({ user: { email: f.user.email } });
});
afterEach(cleanup);
function req(
    method = "GET",
    extra: Record<string, string> = {},
    body: unknown = { action: "prepare", membershipId: f.member.membershipId },
) {
    return new NextRequest("https://member.example/api/member-billing", {
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
it("requires a real signed-in tenant member", async () => {
    session.mockResolvedValueOnce(null);
    expect((await GET(req())).status).toBe(401);
    expect((await POST(req("POST", { domain: "other-tenant" }))).status).toBe(
        404,
    );
});
it("rejects cross-origin, non-JSON and every Mimic POST before invoking billing", async () => {
    const prepare = jest.spyOn(preparation, "prepareMemberCancellation");
    expect(
        (await POST(req("POST", { origin: "https://other.example" }))).status,
    ).toBe(403);
    expect(
        (await POST(req("POST", { "sec-fetch-site": "cross-site" }))).status,
    ).toBe(403);
    expect(
        (await POST(req("POST", { "content-type": "text/plain" }))).status,
    ).toBe(415);
    expect(
        (await POST(req("POST", { cookie: `${MEMBER_MIMIC_COOKIE}=expired` })))
            .status,
    ).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
    expect(await BillingCancellation.countDocuments()).toBe(0);
});
it("does not accept provider identifiers or extra command fields from the browser", async () => {
    const result = await POST(
        req(
            "POST",
            {},
            {
                action: "prepare",
                membershipId: f.member.membershipId,
                subscriptionId: "sub_browser",
            },
        ),
    );
    expect(result.status).toBe(400);
    expect(await BillingCancellation.countDocuments()).toBe(0);
});
it("returns the safe subject projection in Mimic and never falls back after expiry", async () => {
    const resolve = jest.spyOn(mimic, "resolveMemberReadContext");
    resolve.mockResolvedValueOnce({
        kind: "mimic",
        context: { ...f.ctx, memberMimic: { subjectUserId: f.user.userId } },
        view: {},
    } as any);
    const result = await GET(req());
    const view = await result.json();
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(view).toMatchObject({
        readOnly: true,
        memberships: [{ productName: "Practice library" }],
    });
    expect(JSON.stringify(view)).not.toMatch(
        /sub_monthly|cus_member|stripeSecret/,
    );
    resolve.mockResolvedValueOnce({ kind: "expired", view: {} } as any);
    expect((await GET(req())).status).toBe(403);
});
