import { NextRequest } from "next/server";
import { proxy, config } from "../../../../proxy";
import { MEMBER_MIMIC_COOKIE } from "@/services/member-mimic/constants";

jest.mock("@/auth", () => ({
    auth: {
        api: {
            getSession: jest
                .fn()
                .mockResolvedValue({ user: { email: "actor@example.com" } }),
        },
    },
}));

const originalFetch = global.fetch;
beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(async () =>
        Response.json({
            domain: "school",
            domainId: "tenant",
            domainEmail: "school@example.com",
        }),
    );
});
afterEach(() => {
    global.fetch = originalFetch;
});
const request = (path: string, method: string, mimic = true) =>
    new NextRequest(`https://school.example${path}`, {
        method,
        headers: {
            host: "school.example",
            ...(mimic
                ? { cookie: `${MEMBER_MIMIC_COOKIE}=malformed-or-expired` }
                : {}),
        },
    });

it("blocks writes through page server actions as well as API endpoints", async () => {
    for (const path of [
        "/dashboard/profile",
        "/products",
        "/api/feedback",
        "/api/member-billing",
        "/api/member-receipts/receipt-1",
        "/api/contact-preferences",
        "/api/contact-preferences/photo",
        "/api/refund-requests",
        "/api/refund-requests/review",
        "/api/drip-admin",
        "/api/media/asset/file",
        "/api/content-changes",
    ])
        expect((await proxy(request(path, "POST"))).status).toBe(403);
    expect(config.matcher).toContainEqual({
        source: "/:path*",
        has: [{ type: "header", key: "next-action" }],
    });
});

it("records the actual route before rendering and covers all marker-bearing page requests", async () => {
    const req = request("/private-admin-page", "GET");
    req.headers.set("x-courselit-member-view-path", "/dashboard/profile");
    const result = await proxy(req);
    expect(
        result.headers.get("x-middleware-request-x-courselit-member-view-path"),
    ).toBe("/private-admin-page");
    expect(config.matcher).toContainEqual({
        source: "/:path*",
        has: [{ type: "cookie", key: "courselit.member-mimic" }],
    });
});

it("denies private reads and legacy GET side effects while preserving explicit Exit", async () => {
    for (const path of [
        "/api/logout",
        "/api/notifications",
        "/api/track",
        "/api/media/presigned",
        "/api/feedback/private/photos/photo",
        "/api/refund-requests/review",
        "/api/drip-admin",
        "/api/contact-preferences/another-member",
    ])
        expect((await proxy(request(path, "GET"))).status).toBe(403);
    for (const [path, method] of [
        ["/api/member-mimic", "DELETE"],
        ["/api/member-mimic", "GET"],
        ["/api/member-billing", "GET"],
        ["/api/contact-preferences", "GET"],
        ["/api/contact-preferences/photo", "GET"],
        ["/api/refund-requests", "GET"],
        ["/api/member-receipts/receipt-1", "GET"],
        ["/api/media/asset", "GET"],
        ["/api/graph", "POST"],
    ])
        expect(
            (await proxy(request(path, method))).headers.get(
                "x-middleware-next",
            ),
        ).toBe("1");
});

it("leaves the ordinary admin context available after the cookie is cleared", async () => {
    expect(
        (
            await proxy(request("/api/content-changes", "POST", false))
        ).headers.get("x-middleware-next"),
    ).toBe("1");
});
