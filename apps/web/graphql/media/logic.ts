import { Media } from "@courselit/common-models";
import { collectMediaUsage, MediaUsageEntry } from "@courselit/common-logic";
import { checkPermission } from "@courselit/utils";
import constants from "../../config/constants";
import { responses } from "../../config/strings";
import { ADMIN_PERMISSIONS } from "../../ui-config/constants";
import { checkIfAuthenticated } from "../../lib/graphql";
import type GQLContext from "../../models/GQLContext";
import * as medialitService from "../../services/medialit";
const { privateMedia, permissions } = constants;

export const getMedia = async (media?: Media | Partial<Media>) => {
    if (media && media.access === privateMedia && media.mediaId) {
        return medialitService.getMedia(media.mediaId);
    }

    return media;
};

export interface MediaWithUsage extends Partial<Media> {
    usage: MediaUsageEntry[];
}

// Dependencies are injected so the join can be unit-tested without MediaLit or
// Mongo. Production wiring passes the real service + collector.
interface GetMediasDeps {
    listMedia: typeof medialitService.listMedia;
    collectUsage: typeof collectMediaUsage;
}

const defaultDeps: GetMediasDeps = {
    listMedia: medialitService.listMedia,
    collectUsage: collectMediaUsage,
};

export const getMedias = async (
    ctx: GQLContext,
    {
        page = 1,
        limit = 50,
        access,
    }: { page?: number; limit?: number; access?: "public" | "private" },
    deps: GetMediasDeps = defaultDeps,
): Promise<MediaWithUsage[]> => {
    checkIfAuthenticated(ctx);
    // This returns every upload in the school with usage attribution, so it
    // needs an admin permission and not just manageMedia. auth.ts grants
    // manageMedia to every signup — a member needs it to attach an image to a
    // community post — which meant any customer could enumerate the whole
    // school's media library, private objects included.
    if (
        !checkPermission(ctx.user.permissions, [permissions.manageMedia]) ||
        !checkPermission(ctx.user.permissions, ADMIN_PERMISSIONS)
    ) {
        throw new Error(responses.action_not_allowed);
    }

    // Scope to this tenant: uploads are grouped by domain name (see the
    // presigned route), and usage is scanned within this domain only.
    const media = await deps.listMedia(ctx.subdomain.name, page, limit, {
        ...(access ? { access } : {}),
    });
    const usageMap = await deps.collectUsage(ctx.subdomain._id);

    return media.map((m) => ({
        ...m,
        usage: usageMap.get(m.mediaId as string) ?? [],
    }));
};
