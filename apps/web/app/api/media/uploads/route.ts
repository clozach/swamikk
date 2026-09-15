import type { NextRequest } from "next/server";
import { z } from "zod";
import { checkPermission } from "@courselit/utils";
import { UIConstants } from "@courselit/common-models";
import { deleteMedia, getMedia } from "@/services/medialit";
import {
    apiResponse,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";

const upload = z
    .object({ mediaId: z.string().regex(/^[\w-]{1,200}$/) })
    .strict();

/** A completed upload is collectible unless an attachment/history pins it. */
export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        requireCondition(
            ctx.user,
            "unauthorized",
            "Sign in to upload media.",
            401,
        );
        requireCondition(
            checkPermission(ctx.user.permissions, [
                UIConstants.permissions.manageMedia,
            ]),
            "forbidden",
            "Media access is required.",
            403,
        );
        const { mediaId } = upload.parse(await readBoundedJson(req, 1024));
        const media = (await getMedia(mediaId)) as Awaited<
            ReturnType<typeof getMedia>
        > & { group?: string };
        requireCondition(
            media?.mediaId === mediaId && media.group === ctx.subdomain.name,
            "invalid_media",
            "Choose an upload from this site.",
            400,
        );
        // No object deletion or sealing here. The queue checks all native refs
        // after the grace period, including retained and applying edit rows.
        await deleteMedia(mediaId, ctx.subdomain._id);
        return { mediaId, tracked: true };
    });
}
