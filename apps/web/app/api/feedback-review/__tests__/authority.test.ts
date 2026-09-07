import { NextRequest } from "next/server";
import { auth } from "@/auth";
import UserModel from "@/models/User";
import { ReviewGrantModel } from "@/services/feedback-review/models";
import {
    issueGrant,
    listGrants,
    revokeGrant,
} from "@/services/feedback-review/grants";
import { withReviewer } from "@/services/feedback-review/authority";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { POST as issue, GET as list } from "../grants/route";
import { POST as claim } from "../claim/route";
import { POST as contentAction } from "../../content-changes/[id]/route";
import { fixture } from "./fixtures";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));
let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
    jest.restoreAllMocks();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
    f = await fixture();
});
const request = (path: string, body?: unknown, headers = {}) =>
    new NextRequest(`https://site.example${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
            domain: f.domain.name,
            host: "site.example",
            origin: "https://site.example",
            "content-type": "application/json",
            ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
test("grant issuance stores only a hash and returns the credential once; normal reads never expose it", async () => {
    const stored = await ReviewGrantModel.findOne({ id: f.grant.id })
        .select("+tokenHash")
        .lean();
    expect(stored!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(f.token);
    expect(JSON.stringify(await listGrants(f.ctx))).not.toContain(
        stored!.tokenHash,
    );
    expect(
        (await ReviewGrantModel.findOne({ id: f.grant.id }))!.tokenHash,
    ).toBeUndefined();
});
test("issuance needs a real active settings admin and explicit content scope; unknown/prototype/oversized authority is refused", async () => {
    const raw = {
        name: "Review",
        scopes: ["public-page-text"],
        expiresInDays: 1,
    };
    for (const user of [
        undefined,
        { ...f.user.toObject(), permissions: ["site:manage"] },
        { ...f.user.toObject(), active: false },
    ])
        await expect(issueGrant(raw, { ...f.ctx, user })).rejects.toMatchObject(
            { code: "forbidden" },
        );
    await UserModel.updateOne(
        { _id: f.user._id },
        { $set: { permissions: ["setting:manage"] } },
    );
    await expect(issueGrant(raw, f.ctx)).rejects.toMatchObject({
        code: "grant_unavailable",
    });
    await expect(
        issueGrant({ ...raw, scopes: ["publish"] }, f.ctx),
    ).rejects.toBeDefined();
    await expect(
        issueGrant({ ...raw, admin: true }, f.ctx),
    ).rejects.toBeDefined();
    await expect(
        issueGrant(JSON.parse('{"__proto__":{},"name":"Review"}'), f.ctx),
    ).rejects.toMatchObject({ code: "bad_request" });
});
test("dedicated token cannot operate across tenants, after permission removal, expiry or revocation", async () => {
    const other = await fixture();
    await expect(
        withReviewer(
            String(other.domain._id),
            f.token,
            "test",
            async () => true,
        ),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(
        withReviewer(
            String(f.domain._id),
            "ordinary-api-key",
            "test",
            async () => true,
        ),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await UserModel.updateOne(
        { _id: f.user._id },
        { $set: { permissions: ["setting:manage", "site:manage"] } },
    );
    await expect(f.use(async () => true)).rejects.toMatchObject({
        code: "grant_unavailable",
    });
    await UserModel.updateOne(
        { _id: f.user._id },
        { $set: { permissions: f.user.permissions } },
    );
    await ReviewGrantModel.updateOne(
        { id: f.grant.id },
        { $set: { expiresAt: new Date(0) } },
    );
    await expect(f.use(async () => true)).rejects.toMatchObject({
        code: "unauthorized",
    });
    await ReviewGrantModel.updateOne(
        { id: f.grant.id },
        { $set: { expiresAt: new Date(Date.now() + 60000) } },
    );
    expect((await revokeGrant(f.grant.id, f.ctx)).grant.state.kind).toBe(
        "revoked",
    );
    await expect(f.claim()).rejects.toMatchObject({ code: "unauthorized" });
    expect((await revokeGrant(f.grant.id, f.ctx)).grant.state.kind).toBe(
        "revoked",
    );
});
test("revocation wins against later admissions and reports an admitted operation until it finishes", async () => {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => {
        enter = r;
    });
    const resume = new Promise<void>((r) => {
        release = r;
    });
    const pending = f.use(async () => {
        enter();
        await resume;
        return "finished";
    });
    await entered;
    const revoked = await revokeGrant(f.grant.id, f.ctx);
    expect(revoked.grant.state.kind).toBe("revoking");
    expect(revoked.grant.activeOperations).toBe(1);
    await expect(f.use(async () => "late")).rejects.toMatchObject({
        code: "unauthorized",
    });
    release();
    expect(await pending).toBe("finished");
    expect((await listGrants(f.ctx)).grants[0].state.kind).toBe("revoked");
});
test("actual account closure fences review access despite a stale active issuer object", async () => {
    await beginAccountClosure({
        domainId: String(f.domain._id),
        userId: f.user.userId,
    });
    await expect(f.claim()).rejects.toMatchObject({
        code: "account_unavailable",
    });
});
test("review routes do not use the admin session; token cannot approve through normal proposal route", async () => {
    const response = await claim(
        request(
            "/api/feedback-review/claim",
            {},
            { authorization: `Bearer ${f.token}` },
        ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(auth.api.getSession).not.toHaveBeenCalled();
    const approve = await contentAction(
        request(
            "/api/content-changes/invented",
            { action: "approve", version: 1, previewHash: "a".repeat(64) },
            { authorization: `Bearer ${f.token}` },
        ),
        { params: Promise.resolve({ id: "invented" }) },
    );
    expect(approve.status).not.toBe(200);
    expect(
        (
            await claim(
                request(
                    "/api/feedback-review/claim",
                    {},
                    {
                        cookie: "courselit.member-mimic=expired",
                        authorization: `Bearer ${f.token}`,
                    },
                ),
            )
        ).status,
    ).toBe(403);
});
test("admin grant REST routes require session, origin, correct current role and no Mimic", async () => {
    const body = {
        name: "Review",
        scopes: ["public-page-text"],
        expiresInDays: 1,
    };
    expect(
        (await issue(request("/api/feedback-review/grants", body))).status,
    ).toBe(403);
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: f.user.email },
    });
    expect(
        (
            await issue(
                request("/api/feedback-review/grants", body, {
                    origin: "https://foreign.example",
                }),
            )
        ).status,
    ).toBe(403);
    expect(
        (await issue(request("/api/feedback-review/grants", body))).status,
    ).toBe(201);
    const listed = await list(request("/api/feedback-review/grants"));
    expect(listed.status).toBe(200);
    expect(await listed.text()).not.toContain("fbr_");
});
