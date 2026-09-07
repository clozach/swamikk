import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { graphql, GraphQLObjectType, GraphQLSchema } from "graphql";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import PageModel from "@/models/Page";
import { auth } from "@/auth";
import { POST as prepare } from "../route";
import { GET as detail, POST as action } from "../[id]/route";
import pageQueries from "@/graphql/pages/query";
import pageMutations from "@/graphql/pages/mutation";
import { getPage } from "@/graphql/pages/logic";
import PublicPage, {
    generateMetadata,
} from "../../../(with-contexts)/(with-layout)/p/[id]/page";
import { getFullSiteSetup, getPage as routeGetPage } from "@ui-lib/utils";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));
jest.mock("@ui-lib/utils", () => ({
    getFullSiteSetup: jest.fn(),
    getPage: jest.fn(),
}));
jest.mock("@/app/actions", () => ({
    getAddressFromHeaders: jest.fn().mockResolvedValue("https://site.example"),
}));
jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));
jest.mock(
    "../../../(with-contexts)/(with-layout)/p/[id]/client-side-page",
    () => ({ __esModule: true, default: () => null }),
);
let ctx: any;
const input = {
    target: { kind: "page-create", pageId: "new-page" },
    patch: {
        kind: "page-create",
        title: "Private reviewed title",
        content: {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [{ type: "text", text: "Private reviewed text" }],
                },
            ],
        },
        intent: "Create this page",
        materials: "Source",
    },
    summary: "New draft",
};
const request = (path: string, method = "GET", body?: unknown, headers = {}) =>
    new NextRequest(`https://site.example${path}`, {
        method,
        headers: {
            domain: ctx.subdomain.name,
            host: "site.example",
            origin: "https://site.example",
            "content-type": "application/json",
            ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
const schema = new GraphQLSchema({
    query: new GraphQLObjectType({ name: "Query", fields: pageQueries }),
    mutation: new GraphQLObjectType({
        name: "Mutation",
        fields: pageMutations,
    }),
});
beforeEach(async () => {
    jest.clearAllMocks();
    const id = randomUUID();
    const subdomain = await DomainModel.create({
        name: `creation-routes-${id}`,
        email: `${id}@example.com`,
    });
    const user = await UserModel.create({
        domain: subdomain._id,
        userId: id,
        email: subdomain.email,
        active: true,
        permissions: ["site:manage"],
        unsubscribeToken: id,
    });
    ctx = { subdomain, user };
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: user.email },
    });
});
async function propose() {
    const response = await prepare(
        request("/api/content-changes", "POST", input),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    return (await response.json()).change;
}
test("real REST prepare and approve use the new union; native GraphQL and /p route do not expose its draft", async () => {
    const change = await propose();
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        0,
    );
    const response = await action(
        request(`/api/content-changes/${change.id}`, "POST", {
            action: "approve",
            version: 1,
            previewHash: change.previewHash,
        }),
        { params: Promise.resolve({ id: change.id }) },
    );
    expect((await response.json()).change.state.kind).toBe("applied");
    const query =
        'query { getPage(id:"new-page") { title layout draftLayout } }';
    const publicResult = await graphql({
        schema,
        source: query,
        contextValue: { ...ctx, user: undefined },
    });
    expect(publicResult.errors).toBeUndefined();
    expect(publicResult.data?.getPage).toBeNull();
    const adminResult = await graphql({
        schema,
        source: 'query { getPage(id:"new-page") { draftOnly draftTitle } getPages { pageId draftOnly } }',
        contextValue: ctx,
    });
    expect(adminResult.errors).toBeUndefined();
    expect(adminResult.data?.getPage).toMatchObject({
        draftOnly: true,
        draftTitle: input.patch.title,
    });
    (getFullSiteSetup as jest.Mock).mockResolvedValue({ settings: {} });
    (routeGetPage as jest.Mock).mockImplementation((_address, id) =>
        getPage({ id, ctx: { ...ctx, user: undefined } }),
    );
    await expect(
        PublicPage({ params: Promise.resolve({ id: "new-page" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(
        await generateMetadata(
            { params: Promise.resolve({ id: "new-page" }) },
            Promise.resolve({}) as any,
        ),
    ).toEqual({ title: "Page not found" });
});
test("direct API calls reject cross-origin, Mimic and permission removal before approval", async () => {
    expect(
        (
            await prepare(
                request("/api/content-changes", "POST", input, {
                    origin: "https://foreign.example",
                }),
            )
        ).status,
    ).toBe(403);
    expect(
        (
            await prepare(
                request("/api/content-changes", "POST", input, {
                    cookie: "courselit.member-mimic=expired",
                }),
            )
        ).status,
    ).toBe(403);
    const change = await propose();
    await UserModel.updateOne(
        { _id: ctx.user._id },
        { $set: { permissions: [] } },
    );
    expect(
        (
            await action(
                request(`/api/content-changes/${change.id}`, "POST", {
                    action: "approve",
                    version: 1,
                    previewHash: change.previewHash,
                }),
                { params: Promise.resolve({ id: change.id }) },
            )
        ).status,
    ).toBe(403);
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        0,
    );
});
test("tenant isolation and actual closure return ordinary refusal without anonymous fallback", async () => {
    const change = await propose();
    const foreign = await DomainModel.create({
        name: `foreign-${randomUUID()}`,
        email: "foreign@example.com",
    });
    expect(
        (
            await detail(
                request(`/api/content-changes/${change.id}`, "GET", undefined, {
                    domain: foreign.name,
                }),
                { params: Promise.resolve({ id: change.id }) },
            )
        ).status,
    ).toBe(401);
    await beginAccountClosure({
        domainId: String(ctx.subdomain._id),
        userId: ctx.user.userId,
    });
    const closed = await prepare(
        request("/api/content-changes", "POST", input),
    );
    expect(closed.status).toBe(409);
    expect((await closed.json()).error.code).toBe("account_unavailable");
});

test("native GraphQL transports the expected result identity to all editor operations", async () => {
    const change = await propose();
    await action(
        request(`/api/content-changes/${change.id}`, "POST", {
            action: "approve",
            version: 1,
            previewHash: change.previewHash,
        }),
        { params: Promise.resolve({ id: change.id }) },
    );
    const before = JSON.stringify(
        await PageModel.findById(change.baseline.documentId),
    );
    const documentId = "0".repeat(24);
    const result = await graphql({
        schema,
        source: `mutation {
        save: updatePage(pageId: "new-page", documentId: "${documentId}", title: "Wrong result") { pageId }
        publish(pageId: "new-page", documentId: "${documentId}") { pageId }
        remove: deleteBlock(pageId: "new-page", blockId: "any", documentId: "${documentId}") { pageId }
    }`,
        contextValue: ctx,
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toMatchObject({
        save: null,
        publish: null,
        remove: null,
    });
    expect(
        JSON.stringify(await PageModel.findById(change.baseline.documentId)),
    ).toBe(before);
});

test("REST publication review needs a separate version/hash approval and cannot accept caller-authored publication content", async () => {
    const creation = await propose();
    const invoke = (id: string, body: unknown, headers = {}) =>
        action(request(`/api/content-changes/${id}`, "POST", body, headers), {
            params: Promise.resolve({ id }),
        });
    await invoke(creation.id, {
        action: "approve",
        version: 1,
        previewHash: creation.previewHash,
    });
    expect(
        (
            await invoke(
                creation.id,
                { action: "prepare-publication", version: 1 },
                { origin: "https://foreign.example" },
            )
        ).status,
    ).toBe(403);
    expect(
        (
            await invoke(
                creation.id,
                { action: "prepare-publication", version: 1 },
                { cookie: "courselit.member-mimic=expired" },
            )
        ).status,
    ).toBe(403);
    expect(
        (
            await invoke(creation.id, {
                action: "prepare-publication",
                version: 1,
                title: "Unreviewed title",
            })
        ).status,
    ).toBe(400);
    const prepared = await invoke(creation.id, {
        action: "prepare-publication",
        version: 1,
    });
    expect(prepared.status).toBe(200);
    expect(prepared.headers.get("cache-control")).toBe("no-store");
    const change = (await prepared.json()).change;
    expect(change.target.kind).toBe("page-publish");
    expect(
        (await PageModel.findById(creation.baseline.documentId)).draftOnly,
    ).toBe(true);
    expect(
        (
            await invoke(change.id, {
                action: "approve",
                version: 1,
                previewHash: "0".repeat(64),
            })
        ).status,
    ).toBe(409);
    const approved = await invoke(change.id, {
        action: "approve",
        version: 1,
        previewHash: change.previewHash,
    });
    expect((await approved.json()).change.state.kind).toBe("applied");
    expect(
        (await PageModel.findById(creation.baseline.documentId)).draftOnly,
    ).toBe(false);
});
