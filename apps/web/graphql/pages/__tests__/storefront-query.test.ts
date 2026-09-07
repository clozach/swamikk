import {
    graphql,
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLList,
    GraphQLString,
} from "graphql";
import pageTypes from "../types";
import themeTypes from "../../themes/types";
import { getFullSiteSetup, getPage } from "@ui-lib/utils";

jest.mock("react", () => ({
    ...jest.requireActual("react"),
    cache: (fn: unknown) => fn,
}));
jest.mock("@courselit/utils", () => ({
    ...jest.requireActual("@courselit/utils"),
    FetchBuilder: class {
        payload: unknown;
        setUrl() {
            return this;
        }
        setPayload(payload: unknown) {
            this.payload = payload;
            return this;
        }
        setIsGraphQLEndpoint() {
            return this;
        }
        build() {
            return { exec: () => mockExecute(this.payload) };
        }
    },
}));

// The no-ID GraphQL response is shared chrome, not a persisted native page.
// Keep the real GraphQL non-null contract: querying its absent pageId must fail.
const chrome = {
    type: "site",
    layout: [
        { name: "anahataHeader", shared: true },
        { name: "anahataFooter", shared: true },
    ],
};
const nativePage = { ...chrome, pageId: "homepage", title: "Anahata" };
const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
        name: "StorefrontQuery",
        fields: {
            getPage: {
                type: pageTypes.page,
                args: { id: { type: GraphQLString } },
                resolve: (_: unknown, { id }: { id?: string }) =>
                    id ? nativePage : chrome,
            },
            getTheme: {
                type: themeTypes.themeType,
                resolve: () => ({
                    themeId: "theme",
                    name: "Anahata",
                    theme: {},
                }),
            },
            getFeatures: {
                type: new GraphQLList(GraphQLString),
                resolve: () => [],
            },
        },
    }),
});
async function mockExecute(
    payload: string | { query: string; variables?: Record<string, unknown> },
) {
    const source = typeof payload === "string" ? payload : payload.query;
    if (source.includes("getSiteInfo"))
        return { site: { settings: { title: "Anahata" } } };
    const result = await graphql({
        schema,
        source,
        variableValues:
            typeof payload === "string" ? undefined : payload.variables,
    });
    if (result.errors?.length)
        throw new Error(result.errors.map((error) => error.message).join("; "));
    return result.data;
}

test("shared storefront chrome loads without claiming a native page identity", async () => {
    const page = await getPage("http://storefront");
    expect(page?.layout).toEqual(chrome.layout);
    expect(page?.pageId).toBeUndefined();
});
test("full checkout/catalog shell loads through the real Page schema", async () => {
    const site = await getFullSiteSetup("http://storefront");
    expect(site?.page.layout).toEqual(chrome.layout);
    expect(site?.page.pageId).toBeUndefined();
});
test.each([
    getPage,
    async (backend: string, id?: string) =>
        (await getFullSiteSetup(backend, id))?.page,
])("native pages retain their authoritative editing identity", async (read) => {
    expect((await read("http://storefront", "homepage"))?.pageId).toBe(
        "homepage",
    );
});
