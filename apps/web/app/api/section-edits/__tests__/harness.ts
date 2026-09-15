import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import PageModel from "@/models/Page";
import { auth } from "@/auth";
import { GET, POST } from "../route";
import { GET as history } from "../history/route";
import type { PageSections, SectionEditInput } from "@courselit/common-models";

export const widget = (id: string) => ({
    widgetId: id,
    name: "rich-text",
    shared: false,
    deleteable: true,
    settings: {
        heading: id,
        content: [{ type: "paragraph", words: `Words for ${id}` }],
        image: { mediaId: `${id}-media`, url: `/media/${id}` },
    },
});

export async function harness() {
    const id = randomUUID();
    const domain = await DomainModel.create({
        name: `sections-${id}`,
        email: `${id}@example.com`,
    });
    const user = await UserModel.create({
        domain: domain._id,
        userId: id,
        email: domain.email,
        active: true,
        permissions: ["site:manage"],
        unsubscribeToken: id,
    });
    const layout = [
        {
            widgetId: "header",
            name: "anahataHeader",
            shared: true,
            deleteable: false,
        },
        widget("one"),
        widget("two"),
        widget("three"),
        {
            widgetId: "footer",
            name: "anahataFooter",
            shared: true,
            deleteable: false,
        },
    ];
    const page = await PageModel.create({
        domain: domain._id,
        pageId: `page-${id}`,
        type: "site",
        creatorId: user.userId,
        name: "Sections test",
        layout,
        draftLayout: layout,
    });
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: user.email },
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
    const list = (headers = {}) =>
        GET(
            request(
                `/api/section-edits?pageId=${page.pageId}`,
                "GET",
                undefined,
                headers,
            ),
        );
    const listed = async (): Promise<PageSections> => (await list()).json();
    const post = (input: unknown, headers = {}) =>
        POST(request("/api/section-edits", "POST", input, headers));
    const removal = async (widgetId = "two"): Promise<SectionEditInput> => {
        const current = await listed();
        const section = current.sections.find(
            (entry) => entry.widgetId === widgetId,
        )!;
        return {
            action: "remove",
            requestId: randomUUID(),
            target: {
                pageId: page.pageId,
                documentId: String(page._id),
                widgetId,
            },
            fingerprint: section.fingerprint,
        };
    };
    const reverse = (editId: string) =>
        post({ action: "reverse", requestId: randomUUID(), editId });
    const historyResponse = (before?: string, headers = {}) =>
        history(
            request(
                `/api/section-edits/history?pageId=${page.pageId}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
                "GET",
                undefined,
                headers,
            ),
        );
    const fresh = () => PageModel.findById(page._id).lean();
    return {
        domain,
        user,
        page,
        request,
        list,
        listed,
        post,
        removal,
        reverse,
        historyResponse,
        fresh,
    };
}
