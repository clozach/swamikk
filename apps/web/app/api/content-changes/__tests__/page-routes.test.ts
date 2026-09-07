import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import PageModel from "@/models/Page";
import { auth } from "@/auth";
import { GET as fields } from "../page-widget/route";
import { GET as list, POST as prepare } from "../route";
import { GET as detail, POST as action, DELETE as remove } from "../[id]/route";
import { ContentChangeModel } from "@/services/content-changes/models";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));

describe("native page authoring routes", () => {
    let domain: any, user: any, page: any;
    const input = () => ({
        target: {
            kind: "page-widget",
            pageId: page.pageId,
            widgetId: "hero",
            field: "heading",
        },
        patch: { kind: "text", text: "A clearer welcome" },
        summary: "Clarify welcome",
    });
    const request = (
        path: string,
        method = "GET",
        body?: unknown,
        headers = {},
    ) =>
        new NextRequest(`https://site.example${path}`, {
            method,
            headers: {
                domain: domain.name,
                host: "site.example",
                origin: "https://site.example",
                "content-type": "application/json",
                ...headers,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    beforeEach(async () => {
        const id = randomUUID();
        domain = await DomainModel.create({
            name: `page-api-${id}`,
            email: `api-${id}@example.com`,
        });
        user = await UserModel.create({
            domain: domain._id,
            userId: id,
            email: domain.email,
            active: true,
            permissions: ["site:manage"],
            unsubscribeToken: id,
        });
        page = await PageModel.create({
            domain: domain._id,
            pageId: id,
            name: "Home",
            creatorId: id,
            type: "site",
            layout: [
                {
                    widgetId: "hero",
                    name: "anahataHero",
                    shared: false,
                    settings: {},
                },
            ],
        });
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: user.email },
        });
    });
    it("returns only native supported fields without creating drafts, then prepares without applying", async () => {
        const before = await PageModel.findById(page._id).lean();
        const response = await fields(
            request(
                `/api/content-changes/page-widget?pageId=${page.pageId}&widgetId=hero`,
            ),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const body = await response.json();
        expect(
            body.fields.find((field) => field.field === "heading"),
        ).toMatchObject({ kind: "text", defaultDerived: true });
        expect(body).not.toHaveProperty("draftLayout");
        expect(body).not.toHaveProperty("domain");
        expect(await PageModel.findById(page._id).lean()).toEqual(before);
        expect(
            (await prepare(request("/api/content-changes", "POST", input())))
                .status,
        ).toBe(201);
        expect(await PageModel.findById(page._id).lean()).toEqual(before);
    });
    it("rejects cross-origin, foreign page IDs and non-editors", async () => {
        expect(
            (
                await prepare(
                    request("/api/content-changes", "POST", input(), {
                        origin: "https://foreign.example",
                    }),
                )
            ).status,
        ).toBe(403);
        expect(
            (
                await fields(
                    request(
                        "/api/content-changes/page-widget?pageId=foreign&widgetId=hero",
                    ),
                )
            ).status,
        ).toBe(404);
        await UserModel.updateOne(
            { _id: user._id },
            { $set: { permissions: [] } },
        );
        expect(
            (
                await fields(
                    request(
                        `/api/content-changes/page-widget?pageId=${page.pageId}&widgetId=hero`,
                    ),
                )
            ).status,
        ).toBe(403);
        expect(
            (await prepare(request("/api/content-changes", "POST", input())))
                .status,
        ).toBe(403);
        expect(
            await ContentChangeModel.countDocuments({ domain: domain._id }),
        ).toBe(0);
    });
    it("blocks every authoring/read route during Mimic even when invoked without the proxy", async () => {
        const headers = { cookie: "courselit.member-mimic=expired-or-active" },
            params = { params: Promise.resolve({ id: "any-proposal" }) };
        const results = await Promise.all([
            fields(
                request(
                    `/api/content-changes/page-widget?pageId=${page.pageId}&widgetId=hero`,
                    "GET",
                    undefined,
                    headers,
                ),
            ),
            list(request("/api/content-changes", "GET", undefined, headers)),
            prepare(request("/api/content-changes", "POST", input(), headers)),
            detail(
                request(
                    "/api/content-changes/any-proposal",
                    "GET",
                    undefined,
                    headers,
                ),
                params,
            ),
            action(
                request(
                    "/api/content-changes/any-proposal",
                    "POST",
                    { action: "reconcile" },
                    headers,
                ),
                params,
            ),
            remove(
                request(
                    "/api/content-changes/any-proposal",
                    "DELETE",
                    undefined,
                    headers,
                ),
                params,
            ),
        ]);
        expect(results.map((result) => result.status)).toEqual([
            403, 403, 403, 403, 403, 403,
        ]);
        expect(
            await ContentChangeModel.countDocuments({ domain: domain._id }),
        ).toBe(0);
    });
});
