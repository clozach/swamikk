import type { Media, WidgetInstance } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import { getMedia, sealMedia } from "@/services/medialit";
import { isLegacyAvatarMedia } from "@/services/member-privacy";
import { requireCondition } from "./errors";
import { stableJson } from "./stable";

export const pageMediaDependencies = { get: getMedia, seal: sealMedia };
export type PageMediaDependencies = typeof pageMediaDependencies;
function isWebAddress(value: unknown): boolean {
    if (typeof value !== "string" || !value) return false;
    try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password;
    } catch {
        return false;
    }
}
function publicImage(media: Media & { group?: string }, group: string): Media {
    requireCondition(
        media &&
            media.group === group &&
            media.access === "public" &&
            /^image\/(png|jpeg|webp|gif|avif)$/.test(media.mimeType || "") &&
            media.file,
        "invalid_media",
        "Choose a public image from this site's media library.",
        400,
    );
    requireCondition(
        isWebAddress(media.file) &&
            (!media.thumbnail || isWebAddress(media.thumbnail)),
        "invalid_media",
        "This library image has no usable address.",
        400,
    );
    const {
        mediaId,
        originalFileName,
        mimeType,
        size,
        access,
        thumbnail,
        file,
    } = media;
    return {
        mediaId,
        originalFileName,
        mimeType,
        size,
        access,
        thumbnail,
        file,
    };
}
export async function resolvePageImage(
    mediaId: string,
    alt: string,
    widget: WidgetInstance,
    ctx: GQLContext,
    deps: PageMediaDependencies = pageMediaDependencies,
) {
    requireCondition(
        /^[\w-]{1,200}$/.test(mediaId) &&
            typeof alt === "string" &&
            alt.length <= 1000,
        "bad_request",
        "Choose a library image and provide its alternative text.",
    );
    const media = await resolvePublicImageMedia(ctx, mediaId, deps);
    return widget.name === "anahataHero"
        ? { source: { kind: "media", media }, alt }
        : { ...media, caption: alt };
}

/** Validate the native tenant/public raster asset, then pin it before attachment. */
export async function resolvePublicImageMedia(
    ctx: GQLContext,
    mediaId: string,
    deps: PageMediaDependencies = pageMediaDependencies,
): Promise<Media> {
    requireCondition(
        typeof mediaId === "string" && /^[\w-]{1,200}$/.test(mediaId),
        "invalid_media",
        "Choose an image from this site's media library.",
    );
    requireCondition(
        !(await isLegacyAvatarMedia(mediaId)),
        "invalid_media",
        "Member recognition photos cannot be used as public page images.",
        400,
    );
    const selected = publicImage(await deps.get(mediaId), ctx.subdomain.name);
    requireCondition(
        selected.mediaId === mediaId,
        "invalid_media",
        "The public image lookup returned a different asset. Choose it again.",
    );
    // The pending cleanup candidate remains until a live/history reference is saved.
    const media = publicImage(
        await deps.seal(mediaId, ctx.subdomain._id),
        ctx.subdomain.name,
    );
    requireCondition(
        media.mediaId === mediaId,
        "invalid_media",
        "The public image lookup returned a different asset. Choose it again.",
    );
    return media;
}
export async function verifyPageImage(
    value: unknown,
    widget: WidgetInstance,
    ctx: GQLContext,
    deps: PageMediaDependencies = pageMediaDependencies,
) {
    const object = value as {
        source?: { kind?: string; media?: Media };
        mediaId?: string;
        caption?: string;
    };
    const frozen =
        widget.name === "anahataHero"
            ? object?.source?.media
            : (object as Media);
    if (!frozen?.mediaId) return; // A recovery may restore a source-owned, pre-existing image URL.
    const current = publicImage(
        await deps.get(frozen.mediaId),
        ctx.subdomain.name,
    );
    requireCondition(
        stableJson(current) ===
            stableJson(
                publicImage(
                    { ...frozen, group: ctx.subdomain.name },
                    ctx.subdomain.name,
                ),
            ),
        "preview_changed",
        "The selected image changed. Prepare a fresh preview before approval.",
        409,
    );
}
