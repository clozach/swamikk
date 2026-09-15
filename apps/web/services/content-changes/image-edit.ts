import type {
    ImageSource,
    TextChange,
    TextEditInput,
    WidgetInstance,
} from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import { getMedia, sealMedia, deleteMedia } from "@/services/medialit";
import { resolvePublicImageMedia } from "./page-media";
import { PageTextEditModel } from "./models";
import { requireCondition } from "./errors";
import { stableJson } from "./stable";

export const imageEditDependencies = {
    get: getMedia,
    seal: sealMedia,
    discard: deleteMedia,
};
const mediaId = (source: ImageSource) =>
    source.kind === "media" ? source.media.mediaId : undefined;

/** Pin sources before moving their live reference into durable history. */
export function imageEditSession(
    ctx: GQLContext,
    deps = imageEditDependencies,
) {
    const incoming = new Set<string>();
    return {
        async prepare(
            input: TextEditInput,
            widget: WidgetInstance,
            sourceDocumentId: string,
        ): Promise<TextEditInput> {
            const changes = input.changes.filter(
                (change): change is Extract<TextChange, { kind: "image" }> =>
                    change.kind === "image",
            );
            if (!changes.length) return input;
            const recovery = input.undoOf
                ? await PageTextEditModel.findOne({
                      domain: ctx.subdomain._id,
                      editId: input.undoOf,
                      state: "applied",
                      sourceDocumentId,
                      widgetName: widget.name,
                  }).lean()
                : undefined;
            if (input.undoOf)
                requireCondition(
                    recovery &&
                        stableJson(recovery.target) ===
                            stableJson(input.target),
                    "invalid_recovery",
                    "Choose a saved image change for this same picture.",
                );
            const resolved = new Map<string, ImageSource>();
            for (const change of changes) {
                if (input.undoOf)
                    requireCondition(
                        recovery?.changes.some(
                            (old: TextChange) =>
                                old.kind === "image" &&
                                old.path === change.path &&
                                stableJson(old.before) ===
                                    stableJson(change.after),
                        ),
                        "invalid_recovery",
                        "Restore the image retained by this history entry.",
                    );
                else
                    requireCondition(
                        change.after.kind === "media",
                        "invalid_media",
                        "Upload a picture or choose one from this site's media library.",
                    );
                const id = mediaId(change.after);
                if (id) {
                    requireCondition(
                        /^[\w-]{1,200}$/.test(id),
                        "invalid_media",
                        "Choose a valid image from this site's media library.",
                    );
                    // Before sealing, no client-supplied URL or metadata has entered history.
                    const canonical = await resolvePublicImageMedia(
                        ctx,
                        id,
                        deps,
                    );
                    incoming.add(id);
                    resolved.set(
                        change.path,
                        input.undoOf
                            ? change.after
                            : { kind: "media", media: canonical },
                    );
                } else {
                    requireCondition(
                        change.after.kind !== "media",
                        "invalid_media",
                        "This image has no media-library identity.",
                    );
                    resolved.set(change.path, change.after);
                }
                const beforeId = mediaId(change.before);
                if (beforeId && beforeId !== id) {
                    await resolvePublicImageMedia(ctx, beforeId, deps);
                }
            }
            return {
                ...input,
                changes: input.changes.map((change) =>
                    change.kind === "image"
                        ? { ...change, after: resolved.get(change.path)! }
                        : change,
                ),
            };
        },
        async abandon() {
            // The existing delayed collector rechecks all live/draft/history refs.
            // If the source committed but its acknowledgment was lost, retained
            // PageTextEdit history keeps both pictures safe.
            await Promise.all(
                Array.from(incoming).map((id) =>
                    deps.discard(id, ctx.subdomain._id),
                ),
            );
        },
    };
}
export type ImageEditSession = ReturnType<typeof imageEditSession>;
