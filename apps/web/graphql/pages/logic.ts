import { assertApprovedPublication } from "./approved-publication";
import type { PagePublicationGuard } from "@/services/content-changes/page-publication-types";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { expectedPageIdentity } from "./identity";
import { checkDraftPublication } from "./draft-publication";
import { pageWriteFilter } from "@/services/content-changes/page-guard";
import { nativePageBaseline, guardedNativePageSave } from "./guarded-save";
import {
    SITE_FOOTER_WIDGET,
    SITE_HEADER_WIDGET,
    hasMandatoryBlocks,
} from "../../config/site-chrome";
import { responses } from "../../config/strings";
import DomainModel from "@models/Domain";
import { checkIfAuthenticated } from "../../lib/graphql";
import GQLContext from "../../models/GQLContext";
import PageModel, { Page } from "../../models/Page";
import {
    copySharedWidgetsToDomain,
    generateUniquePageId,
    getPageResponse,
    initSharedWidgets,
    isDuplicateKeyError,
} from "./helpers";
import constants from "../../config/constants";
import Course from "../../models/Course";
import { checkPermission, extractMediaIDs } from "@courselit/utils";
import { Media, User, Constants } from "@courselit/common-models";
import { Domain } from "../../models/Domain";
import { homePageTemplate } from "./page-templates";
import { publishTheme } from "../themes/logic";
import getDeletedMediaIds from "@/lib/get-deleted-media-ids";
import { deleteMedia, sealMedia } from "@/services/medialit";
import CommunityModel from "@models/Community";
import { replaceTempMediaWithSealedMediaInPageLayout } from "@/lib/replace-temp-media-with-sealed-media-in-page-layout";
import { invalidateDomainCache } from "@/lib/domain-cache";
const { product, site, blogPage, communityPage, permissions, defaultPages } =
    constants;
const { pageNames } = Constants;

export async function getPage({
    id,
    ctx,
    justWidgets = false,
    documentId,
}: {
    id?: string;
    ctx: GQLContext;
    justWidgets?: boolean;
    documentId?: string;
}) {
    await initSharedWidgets(ctx);
    if (!id) {
        // This is where every route that isn't a page in its own right gets its
        // chrome, so it has to honour the configured blocks rather than the
        // stock pair — otherwise a site with replacement chrome renders the
        // stock header and footer around all of its real content.
        return {
            type: site,
            layout: [
                ctx.subdomain.sharedWidgets[SITE_HEADER_WIDGET],
                ctx.subdomain.sharedWidgets[SITE_FOOTER_WIDGET],
            ].filter(Boolean),
        };
    }

    const isAdmin =
        ctx.user &&
        checkPermission(ctx.user.permissions, [permissions.manageSite]);
    if (isAdmin) {
        const page = await PageModel.findOne(
            {
                pageId: id,
                ...expectedPageIdentity(documentId),
                domain: ctx.subdomain._id,
                deleted: { $ne: true },
            },
            {
                pageId: 1,
                layout: 1,
                name: 1,
                title: 1,
                description: 1,
                socialImage: 1,
                robotsAllowed: 1,
                type: 1,
                entityId: 1,
                draftOnly: 1,
                draftLayout: 1,
                draftTitle: 1,
                draftDescription: 1,
                draftSocialImage: 1,
                draftRobotsAllowed: 1,
            },
        );
        if (!page) return;

        return getPageResponse(page, ctx);
    } else {
        const page = await PageModel.findOne(
            {
                pageId: id,
                ...expectedPageIdentity(documentId),
                draftOnly: { $ne: true },
                domain: ctx.subdomain._id,
                deleted: { $ne: true },
            },
            {
                pageId: 1,
                layout: 1,
                name: 1,
                type: 1,
                entityId: 1,
                title: 1,
                description: 1,
                socialImage: 1,
                robotsAllowed: 1,
            },
        );
        if (!page) return;

        if (page.type === product) {
            const course = await Course.findOne({
                courseId: page.entityId,
                domain: ctx.subdomain._id,
                published: true,
            });
            if (!course) {
                return;
            }
        }

        if (page.type === communityPage) {
            const community = await CommunityModel.findOne({
                domain: ctx.subdomain._id,
                communityId: page.entityId,
                enabled: true,
            });
            if (!community) {
                return;
            }
        }

        return getPageResponse(page, ctx);
    }
}

export const updatePage = async ({
    context: ctx,
    pageId,
    documentId,
    layout: inputLayout,
    title,
    description,
    socialImage,
    robotsAllowed,
}: {
    context: GQLContext;
    pageId: string;
    documentId?: string;
    layout?: string;
    title?: string;
    description?: string;
    socialImage?: Media | null;
    robotsAllowed?: boolean;
}): Promise<Partial<Page> | null> => {
    checkIfAuthenticated(ctx);
    if (!checkPermission(ctx.user.permissions, [permissions.manageSite])) {
        throw new Error(responses.action_not_allowed);
    }
    const page: Page | null = await PageModel.findOne({
        pageId,
        ...expectedPageIdentity(documentId),
        domain: ctx.subdomain._id,
        deleted: { $ne: true },
    });

    if (!page) {
        return null;
    }
    const baseline = nativePageBaseline(page);

    const deletedMediaIds = getDeletedMediaIds(
        JSON.stringify(page.draftLayout || ""),
        inputLayout || "",
    );
    const publishedLayoutMediaIds = extractMediaIDs(
        JSON.stringify(page.layout ?? []),
    );
    if (page.socialImage?.mediaId) {
        publishedLayoutMediaIds.add(page.socialImage?.mediaId);
    }
    if (inputLayout) {
        try {
            let layout;
            try {
                layout = JSON.parse(inputLayout);
                // The site's chrome may be a replacement block (SITE_*_WIDGET),
                // not only the stock "header"/"footer" names; checking the
                // literals rejected every save on a site running its own chrome.
                if (!hasMandatoryBlocks(layout)) {
                    throw new Error(responses.missing_mandatory_blocks);
                }
            } catch (err) {
                throw new Error(`${responses.invalid_layout}: ${err.message}`);
            }
            const layoutWithSharedWidgetsSettings =
                await copySharedWidgetsToDomain(layout, ctx.subdomain);
            const draftLayoutWithSealedMedia =
                await replaceTempMediaWithSealedMediaInPageLayout(
                    layoutWithSharedWidgetsSettings,
                    ctx.subdomain._id,
                );
            page.draftLayout = draftLayoutWithSealedMedia;
        } catch (err: any) {
            throw new Error(err.message);
        }
    }
    if (title) {
        page.draftTitle = title;
    }
    if (description) {
        page.draftDescription = description;
    }
    if (typeof socialImage !== "undefined") {
        const previousDraftSocialImageId = page.draftSocialImage?.mediaId;

        if (socialImage === null) {
            page.draftSocialImage = null;
        } else if (socialImage.mediaId) {
            const sealedMedia = await sealMedia(
                socialImage.mediaId,
                ctx.subdomain._id,
            );
            page.draftSocialImage = sealedMedia;
        }

        if (previousDraftSocialImageId) {
            deletedMediaIds.push(previousDraftSocialImageId);
        }
    }
    if (typeof robotsAllowed === "boolean") {
        page.draftRobotsAllowed = robotsAllowed;
    }

    const deletableMediaIds = Array.from(deletedMediaIds).filter(
        (mediaId) => !publishedLayoutMediaIds.has(mediaId),
    );

    for (const mediaId of deletableMediaIds) {
        try {
            await deleteMedia(mediaId, ctx.subdomain._id);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.log(`Error while deleting media`, mediaId);
        }
    }

    const savedPage = await guardedNativePageSave(page, baseline);

    return getPageResponse(savedPage, ctx);
};

const publishNative = async (
    pageId: string,
    ctx: GQLContext,
    documentId?: string,
    publicationGuard?: PagePublicationGuard,
): Promise<Partial<Page> | null> => {
    checkIfAuthenticated(ctx);
    if (!checkPermission(ctx.user.permissions, [permissions.manageSite])) {
        throw new Error(responses.action_not_allowed);
    }
    const page: Page | null = await PageModel.findOne({
        pageId,
        ...expectedPageIdentity(documentId),
        domain: ctx.subdomain._id,
        deleted: { $ne: true },
    });

    if (!page) {
        return null;
    }
    const baseline = nativePageBaseline(page);
    if (publicationGuard)
        await assertApprovedPublication(baseline, publicationGuard, ctx);
    const firstPublication = page.draftOnly === true;
    if (firstPublication) await checkDraftPublication(ctx);
    if (firstPublication) page.draftOnly = false;

    // 1. Identify all media currently in PUBLISHED state (to be potentially deleted)
    const currentPublishedMedia = extractMediaIDs(
        JSON.stringify(page.layout || []),
    );
    if (page.socialImage?.mediaId) {
        currentPublishedMedia.add(page.socialImage.mediaId);
    }

    // 2. Identify all media in NEW PUBLISHED state (from draft)
    const nextPublishedMedia = extractMediaIDs(
        JSON.stringify(page.draftLayout || []),
    );
    if (page.draftSocialImage?.mediaId) {
        nextPublishedMedia.add(page.draftSocialImage.mediaId);
    }

    // 3. Delete (Current - Next)
    const mediaToDelete = Array.from(currentPublishedMedia).filter(
        (id) => !nextPublishedMedia.has(id),
    );

    if (page.draftLayout.length) {
        page.layout = page.draftLayout;
        // page.draftLayout = [];
    }
    if (page.draftTitle) {
        page.title = page.draftTitle;
        // page.draftTitle = undefined;
    }
    if (page.draftDescription) {
        page.description = page.draftDescription;
        // page.draftDescription = undefined;
    }
    if (
        page.draftRobotsAllowed ||
        (firstPublication && typeof page.draftRobotsAllowed === "boolean")
    ) {
        page.robotsAllowed = page.draftRobotsAllowed;
        // page.draftRobotsAllowed = undefined;
    }
    if (page.draftSocialImage === null) {
        page.socialImage = undefined;
    } else if (typeof page.draftSocialImage !== "undefined") {
        page.socialImage = page.draftSocialImage;
    }

    if (!firstPublication) {
        if (ctx.subdomain.themeId) {
            await publishTheme(ctx.subdomain.themeId, ctx);
        }

        await DomainModel.findOneAndUpdate(
            { _id: ctx.subdomain._id },
            {
                $set: {
                    typefaces: ctx.subdomain.draftTypefaces,
                    sharedWidgets: ctx.subdomain.draftSharedWidgets,
                },
            },
        );
    }
    // The request-scoped domain cache would otherwise keep serving the
    // pre-publish shared widgets (header/footer settings) for up to a minute —
    // or indefinitely while requests keep re-caching the stale copy.
    invalidateDomainCache(ctx.subdomain.name);
    for (const mediaId of mediaToDelete) {
        await deleteMedia(mediaId, ctx.subdomain._id);
    }
    const savedPage = await guardedNativePageSave(
        page,
        baseline,
        publicationGuard?.receipt,
    );

    return getPageResponse(savedPage, ctx);
};

export const publish = async (
    pageId: string,
    ctx: GQLContext,
    documentId?: string,
    guard?: PagePublicationGuard,
): Promise<Partial<Page> | null> => {
    if (guard)
        return withAccountWrite(
            {
                domainId: String(ctx.subdomain._id),
                userId: ctx.user?.userId,
                purpose: "approved-page-publication",
            },
            () => publishNative(pageId, ctx, documentId, guard),
        );
    return publishNative(pageId, ctx, documentId);
};

export const getPages = async (
    ctx: GQLContext,
    type?:
        | typeof product
        | typeof site
        | typeof blogPage
        | typeof communityPage,
) => {
    checkIfAuthenticated(ctx);
    if (!checkPermission(ctx.user.permissions, [permissions.manageSite])) {
        throw new Error(responses.action_not_allowed);
    }

    const filter: Record<string, unknown> = {
        domain: ctx.subdomain._id,
        deleted: { $ne: true },
    };

    if (type) {
        filter.type = type;
    }

    const pages: Page[] = await PageModel.find(filter, {
        pageId: 1,
        name: 1,
        type: 1,
        entityId: 1,
        deleteable: 1,
        draftOnly: 1,
    });

    return pages;
};

export const initMandatoryPages = async (domain: Domain, user: User) => {
    await PageModel.bulkWrite([
        {
            updateOne: {
                filter: { domain: domain._id, pageId: defaultPages[0] },
                update: {
                    $setOnInsert: {
                        domain: domain._id,
                        pageId: defaultPages[0],
                        type: site,
                        creatorId: user.userId,
                        name: pageNames.home,
                        entityId: domain.name,
                        layout: [
                            {
                                name: SITE_HEADER_WIDGET,
                                deleteable: false,
                                shared: true,
                            },
                            ...homePageTemplate,
                            {
                                name: SITE_FOOTER_WIDGET,
                                deleteable: false,
                                shared: true,
                            },
                        ],
                        draftLayout: [],
                    },
                },
                upsert: true,
            },
        },
        {
            updateOne: {
                filter: { domain: domain._id, pageId: defaultPages[2] },
                update: {
                    $setOnInsert: {
                        domain: domain._id,
                        pageId: defaultPages[2],
                        type: site,
                        creatorId: user.userId,
                        name: pageNames.privacy,
                        entityId: domain.name,
                        layout: [
                            {
                                name: SITE_HEADER_WIDGET,
                                deleteable: false,
                                shared: true,
                            },
                            {
                                name: SITE_FOOTER_WIDGET,
                                deleteable: false,
                                shared: true,
                            },
                        ],
                        draftLayout: [],
                    },
                },
                upsert: true,
            },
        },
        {
            updateOne: {
                filter: { domain: domain._id, pageId: defaultPages[1] },
                update: {
                    $setOnInsert: {
                        domain: domain._id,
                        pageId: defaultPages[1],
                        type: site,
                        creatorId: user.userId,
                        name: pageNames.terms,
                        entityId: domain.name,
                        layout: [
                            {
                                name: SITE_HEADER_WIDGET,
                                deleteable: false,
                                shared: true,
                            },
                            {
                                name: SITE_FOOTER_WIDGET,
                                deleteable: false,
                                shared: true,
                            },
                        ],
                        draftLayout: [],
                    },
                },
                upsert: true,
            },
        },
        {
            updateOne: {
                filter: { domain: domain._id, pageId: defaultPages[3] },
                update: {
                    $setOnInsert: {
                        domain: domain._id,
                        pageId: defaultPages[3],
                        type: blogPage,
                        creatorId: user.userId,
                        name: pageNames.blog,
                        entityId: domain.name,
                        layout: [
                            {
                                name: SITE_HEADER_WIDGET,
                                deleteable: false,
                                shared: true,
                            },
                            {
                                name: SITE_FOOTER_WIDGET,
                                deleteable: false,
                                shared: true,
                            },
                        ],
                        draftLayout: [],
                    },
                },
                upsert: true,
            },
        },
    ]);
};

export const createPage = async ({
    context: ctx,
    name,
    pageId,
}: {
    context: GQLContext;
    name: string;
    pageId: string;
}): Promise<Partial<Page>> => {
    checkIfAuthenticated(ctx);
    if (!checkPermission(ctx.user.permissions, [permissions.manageSite])) {
        throw new Error(responses.action_not_allowed);
    }

    const uniquePageId = await generateUniquePageId(
        ctx.subdomain._id,
        pageId,
        false,
    );

    try {
        const page: Page = await PageModel.create({
            domain: ctx.subdomain._id,
            pageId: uniquePageId,
            type: site,
            creatorId: ctx.user.userId,
            name,
            entityId: ctx.subdomain.name,
            deleteable: true,
            layout: [
                {
                    name: SITE_HEADER_WIDGET,
                    deleteable: false,
                    shared: true,
                },
                {
                    name: SITE_FOOTER_WIDGET,
                    deleteable: false,
                    shared: true,
                },
            ],
        });

        return page;
    } catch (err) {
        if (isDuplicateKeyError(err)) {
            throw new Error(responses.page_id_already_exists);
        }
        throw err;
    }
};

export const deletePage = async (
    ctx: GQLContext,
    id: (typeof defaultPages)[number],
) => {
    checkIfAuthenticated(ctx);
    if (!checkPermission(ctx.user.permissions, [permissions.manageSite])) {
        throw new Error(responses.action_not_allowed);
    }

    if (defaultPages.includes(id)) {
        throw new Error(responses.action_not_allowed);
    }

    await deletePageInternal(ctx, id);

    return true;
};

export const deletePageInternal = async (ctx: GQLContext, id: string) => {
    const { ContentChangeModel } = await import(
        "@/services/content-changes/models"
    );
    const page = (await PageModel.findOne({
        domain: ctx.subdomain._id,
        pageId: id,
        deleted: { $ne: true },
    }).lean()) as unknown as Page;

    if (!page) {
        throw new Error(responses.item_not_found);
    }

    if (
        await ContentChangeModel.exists({
            domain: ctx.subdomain._id,
            activeTarget: `page:${(page as Page & { _id?: unknown })._id || page.id}`,
        })
    ) {
        throw new Error(
            "Reconcile the pending page change before deleting this page.",
        );
    }

    const mediaToBeDeleted = extractMediaIDs(JSON.stringify(page));
    for (const mediaId of Array.from(mediaToBeDeleted)) {
        await deleteMedia(mediaId, ctx.subdomain._id);
    }

    if (page.creationReceipt) {
        const documentId = String(
            (page as Page & { _id?: unknown })._id || page.id,
        );
        const erased = await PageModel.updateOne(
            { ...pageWriteFilter(page), deleteable: true },
            {
                $set: {
                    pageId: `removed-${documentId}`,
                    name: "Removed page",
                    deleted: true,
                    draftOnly: true,
                    deleteable: false,
                    layout: [],
                    draftLayout: [],
                    robotsAllowed: false,
                },
                $unset: {
                    title: 1,
                    draftTitle: 1,
                    description: 1,
                    draftDescription: 1,
                    socialImage: 1,
                    draftSocialImage: 1,
                    draftRobotsAllowed: 1,
                },
                $inc: { __v: 1 },
            },
        );
        if (!erased.modifiedCount)
            throw new Error("The page changed. Refresh before deleting it.");
        return;
    }
    await PageModel.deleteOne({
        domain: ctx.subdomain._id,
        deleteable: true,
        pageId: id,
    });
};

export const deleteBlock = async ({
    context: ctx,
    pageId,
    blockId,
    documentId,
}: {
    context: GQLContext;
    pageId: string;
    blockId: string;
    documentId?: string;
}) => {
    checkIfAuthenticated(ctx);
    if (!checkPermission(ctx.user.permissions, [permissions.manageSite])) {
        throw new Error(responses.action_not_allowed);
    }
    const page: Page | null = await PageModel.findOne({
        pageId,
        ...expectedPageIdentity(documentId),
        domain: ctx.subdomain._id,
        deleted: { $ne: true },
    });

    if (!page) {
        return null;
    }
    const baseline = nativePageBaseline(page);

    const block = page.draftLayout.find(
        (block: any) => block.widgetId === blockId,
    );
    if (!block) {
        return null;
    }

    const deletedMediaIds = extractMediaIDs(JSON.stringify(block));
    const publishedLayoutMediaIds = extractMediaIDs(
        JSON.stringify(page.layout ?? []),
    );
    const deletableMediaIds = Array.from(deletedMediaIds).filter(
        (mediaId) => !publishedLayoutMediaIds.has(mediaId),
    );
    for (const mediaId of deletableMediaIds) {
        await deleteMedia(mediaId, ctx.subdomain._id);
    }

    page.draftLayout = page.draftLayout.filter(
        (block: any) => block.widgetId !== blockId,
    );
    const savedPage = await guardedNativePageSave(page, baseline);
    return getPageResponse(savedPage, ctx);
};
