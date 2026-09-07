import { randomUUID } from "crypto";
import mongoose from "mongoose";
import DomainModel from "@/models/Domain";
import PageModel from "@/models/Page";
import type GQLContext from "@/models/GQLContext";
import { SITE_HEADER_WIDGET, SITE_FOOTER_WIDGET } from "@/config/site-chrome";
import { requirePageEditor, publishedPageRenderContext } from "./page-adapter";
import { requireCondition } from "./errors";
import { fingerprint } from "./stable";
import { validateTextEdit } from "./text-safety";
import type {
    PageCreationInput,
    PageCreationChange,
} from "./page-creation-types";

/** Read current published chrome, never initialize or promote shared drafts. */
export async function pageCreationRenderContext(ctx: GQLContext) {
    const domain = await DomainModel.findById(ctx.subdomain._id);
    requireCondition(domain, "not_found", "Site not found.", 404);
    const rendering = await publishedPageRenderContext({
        ...ctx,
        subdomain: domain,
    });
    return {
        ...rendering,
        hash: fingerprint({
            ...rendering,
            sharedWidgets: domain.sharedWidgets || {},
        }),
    };
}
export async function preparePageCreation(
    input: PageCreationInput,
    version: number,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
    requireCondition(
        !input.target.pageId.startsWith("removed-"),
        "invalid_input",
        "Choose a different page address.",
    );
    requireCondition(
        !(await PageModel.exists({
            domain: ctx.subdomain._id,
            pageId: input.target.pageId,
        })),
        "route_collision",
        "This page address already exists. Choose another address.",
        409,
    );
    validateTextEdit({ type: "doc", content: [] }, input.patch.content);
    const rendering = await pageCreationRenderContext(ctx);
    const next = {
        version,
        summary: input.summary,
        patch: input.patch,
        baseline: {
            kind: "page-create" as const,
            documentId: new mongoose.Types.ObjectId().toString(),
            renderFingerprint: rendering.hash,
            theme: rendering.theme,
            typefaces: rendering.typefaces,
        },
        preview: {
            title: input.patch.title,
            path: `/p/${input.target.pageId}`,
            layout: [
                {
                    widgetId: randomUUID(),
                    name: SITE_HEADER_WIDGET,
                    shared: true,
                    deleteable: false,
                },
                {
                    widgetId: randomUUID(),
                    name: "rich-text",
                    shared: false,
                    deleteable: true,
                    settings: {
                        type: "site",
                        pageId: input.target.pageId,
                        entityId: ctx.subdomain.name,
                        alignment: "left",
                        text: {
                            type: "doc",
                            content: [
                                {
                                    type: "heading",
                                    attrs: { level: 1 },
                                    content: [
                                        {
                                            type: "text",
                                            text: input.patch.title,
                                        },
                                    ],
                                },
                                ...input.patch.content.content,
                            ],
                        },
                    },
                },
                {
                    widgetId: randomUUID(),
                    name: SITE_FOOTER_WIDGET,
                    shared: true,
                    deleteable: false,
                },
            ],
        },
        preparedBy: ctx.user.userId,
        preparedAt: new Date().toISOString(),
    };
    return {
        ...next,
        previewHash: fingerprint({ target: input.target, ...next }),
    } as Omit<
        PageCreationChange,
        | "id"
        | "target"
        | "state"
        | "history"
        | "approvals"
        | "createdAt"
        | "updatedAt"
    >;
}
