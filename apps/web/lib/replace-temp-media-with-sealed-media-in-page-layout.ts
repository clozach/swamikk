import { sealMedia } from "@/services/medialit";
import { extractMediaIDs } from "@courselit/utils";
import { Media } from "@courselit/common-models";
import mongoose from "mongoose";

export async function replaceTempMediaWithSealedMediaInPageLayout(
    layout: any,
    domain: mongoose.Types.ObjectId | string,
): Promise<any> {
    const mediaIds = Array.from(extractMediaIDs(JSON.stringify(layout)));
    for (const mediaId of mediaIds) {
        const media = await safeSealMedia(mediaId, domain);
        if (media) {
            layout = replaceMediaURLinPageLayout(layout, mediaId, media);
        }
    }

    return layout;
}

export async function safeSealMedia(
    mediaId: string,
    domain: mongoose.Types.ObjectId | string,
) {
    try {
        return await sealMedia(mediaId, domain);
    } catch (err) {
        console.error(`Error while sealing media`, mediaId);
    }
}

function replaceMediaURLinPageLayout(
    layout: any,
    mediaId: string,
    media: Media,
): any {
    const traverse = (node: any): any => {
        if (typeof node === "string") {
            try {
                const { pathname } = new URL(node);
                const segments = pathname.split("/").filter(Boolean);

                if (segments.length >= 2) {
                    const lastSegment = segments[segments.length - 1];
                    const id = segments[segments.length - 2];

                    if (id === mediaId) {
                        if (/^main\.[^/]+$/i.test(lastSegment) && media.file) {
                            return media.file;
                        }
                        if (
                            /^thumb\.[^/]+$/i.test(lastSegment) &&
                            media.thumbnail
                        ) {
                            return media.thumbnail;
                        }
                    }
                }
            } catch {
                // Ignore invalid URLs
            }

            return node;
        }

        if (Array.isArray(node)) {
            return node.map(traverse);
        }

        if (node && typeof node === "object") {
            for (const key in node) {
                node[key] = traverse(node[key]);
            }
            return node;
        }

        return node;
    };

    return traverse(layout);
}
