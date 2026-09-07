import type { Media } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import type { InternalCourse } from "@/models/Course";
import { getMedia, sealMedia } from "@/services/medialit";

function validatePreview(media: Media & { group?: string }, group: string) {
    if (
        media.group !== group ||
        media.access !== "public" ||
        !media.mimeType?.startsWith("audio/") ||
        !media.file
    ) {
        throw new Error(
            "Choose a public audio preview from this site's media library.",
        );
    }
    const url = new URL(media.file);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(
            "The selected preview has no playable public audio URL.",
        );
    }
    return media;
}

export async function preparePreviewAudio(
    mediaId: string | null | undefined,
    ctx: GQLContext,
) {
    if (mediaId === null) return undefined;
    if (typeof mediaId !== "string" || !/^[\w-]{1,200}$/.test(mediaId)) {
        throw new Error("Choose an audio preview from the media library.");
    }
    // The client supplies an ID only. MediaLit is the authority for tenant,
    // access and MIME type; a paid lesson URL cannot become a public preview.
    validatePreview(await getMedia(mediaId), ctx.subdomain.name);
    const sealed = await sealMedia(mediaId, ctx.subdomain._id);
    return validatePreview(sealed, ctx.subdomain.name);
}

export async function resolvePreviewAudio(
    course: InternalCourse,
    ctx: GQLContext,
) {
    if (
        !course.previewAudio?.mediaId ||
        String(course.domain) !== String(ctx.subdomain._id)
    )
        return null;
    try {
        // Revalidate each read: making the asset private revokes the preview.
        return validatePreview(
            await getMedia(course.previewAudio.mediaId),
            ctx.subdomain.name,
        );
    } catch {
        return null;
    }
}
