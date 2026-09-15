import type {
    ImageSource,
    PageImageLeaf,
    WidgetInstance,
} from "@courselit/common-models";
import { defaultsFor } from "./text-leaves";
import { requireCondition } from "./errors";
import { normalizeImageSource } from "../../../../packages/page-blocks/src/components/image-source";
import { headerLogoSource } from "../../../../packages/page-blocks/src/blocks/anahata-header/logo-source";
import { normalizePostThumbnail } from "../../../../packages/page-blocks/src/blocks/anahata-posts/thumbnail";
import { eventImage } from "../../../../packages/page-blocks/src/blocks/anahata-gatherings/normalize";

const record = (value: unknown): Record<string, any> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, any>)
        : {};
const raster = (value: unknown) =>
    /^image\/(png|jpeg|webp|gif|avif)$/.test(record(value).mimeType || "");

/** Allowlisted native image slots. Arrays follow the renderer's order, including legacy source aliases. */
export function widgetImageLeaves(widget: WidgetInstance): PageImageLeaf[] {
    const settings = {
        ...defaultsFor(widget.name),
        ...Object.fromEntries(
            Object.entries(widget.settings || {}).filter(
                ([, value]) => value !== undefined,
            ),
        ),
    };
    const images: PageImageLeaf[] = [];
    const add = (path: string, label: string, value: unknown) => {
        const source = normalizeImageSource(value);
        if (source) {
            if (
                (widget.name === "media" || widget.name === "anahataTour") &&
                source.kind === "media"
            ) {
                const media = { ...source.media };
                delete media.caption;
                images.push({ path, label, value: { kind: "media", media } });
            } else images.push({ path, label, value: source });
        }
    };
    switch (widget.name) {
        case "anahataHeader":
            add(
                "logoSource",
                "Site mark",
                headerLogoSource(widget.settings || {}),
            );
            break;
        case "anahataHero":
            for (const [field, label] of [
                ["bannerImage", "Welcome photograph"],
                ["wordmark", "Welcome mark"],
                ["photo", "Welcome photograph"],
            ])
                add(`${field}.source`, label, record(settings[field]).source);
            break;
        case "anahataGatherings":
            (Array.isArray(settings.events)
                ? settings.events
                : (defaultsFor(widget.name).events as any[])
            ).forEach((event, index) =>
                add(
                    `events.${index}.image`,
                    `Gathering ${index + 1} photograph`,
                    eventImage(event),
                ),
            );
            break;
        case "anahataPosts":
            if (Array.isArray(settings.posts))
                settings.posts.forEach((post, index) =>
                    add(
                        `posts.${index}.thumbnail.source`,
                        `Post ${index + 1} photograph`,
                        normalizePostThumbnail(record(post).thumbnail).source,
                    ),
                );
            break;
        case "anahataPrivateSessions":
            add(
                "photo",
                "Private sessions photograph",
                normalizeImageSource(settings.photo) ??
                    defaultsFor(widget.name).photo,
            );
            if (settings.showDecorImage)
                add(
                    "decorImage",
                    "Private sessions decoration",
                    normalizeImageSource(settings.decorImage) ??
                        defaultsFor(widget.name).decorImage,
                );
            break;
        case "anahataFooter":
            if (Array.isArray(settings.columns))
                settings.columns.forEach((column, index) => {
                    if (record(column).kind === "contact")
                        add(
                            `columns.${index}.logoSource`,
                            "Footer mark",
                            normalizeImageSource(column.logoSource) ??
                                normalizeImageSource(column.logoUrl),
                        );
                });
            for (const side of ["Left", "Right"])
                if (
                    settings[`decor${side}Source`] ||
                    settings[`decor${side}Url`]
                )
                    add(
                        `decor${side}Source`,
                        `Footer ${side.toLowerCase()} decoration`,
                        normalizeImageSource(settings[`decor${side}Source`]) ??
                            normalizeImageSource(settings[`decor${side}Url`]),
                    );
            break;
        case "anahataTour":
            if (
                settings.loadStrategy === "click" &&
                raster(settings.posterImage)
            )
                add("posterImage", "Tour poster", settings.posterImage);
            break;
        case "media":
            if (!settings.youtubeLink && raster(settings.media))
                add("media", "Image", settings.media);
            break;
        // Newsletter has no picture. Banner pictures belong to Domain/Course/Community,
        // not its settings: those retain their native authoring routes.
    }
    return images;
}

/** Copy only ancestors of the chosen slot. Preserve IDs, BSON values and metadata in every other branch. */
function put(value: any, segments: string[], replacement: unknown): any {
    if (!segments.length) return replacement;
    const [key, ...rest] = segments;
    const copy = Array.isArray(value) ? [...value] : { ...record(value) };
    copy[key] = put(value?.[key], rest, replacement);
    return copy;
}

export function setImageLeaf(
    widget: WidgetInstance,
    path: string,
    source: ImageSource,
): Record<string, unknown> {
    requireCondition(
        widgetImageLeaves(widget).some((image) => image.path === path),
        "unsupported_target",
        "Choose an image on this page.",
    );
    const settings = { ...(widget.settings || {}) };
    const [root] = path.split(".");
    const effective =
        settings[root] === undefined
            ? defaultsFor(widget.name)[root]
            : settings[root];
    if (widget.name === "media" || widget.name === "anahataTour") {
        requireCondition(
            source.kind === "media",
            "unsupported_target",
            "This picture uses a native media-library asset.",
        );
        return {
            ...settings,
            [root]: {
                ...source.media,
                ...(record(effective).caption === undefined
                    ? {}
                    : { caption: record(effective).caption }),
            },
        };
    }
    let base = effective;
    if (widget.name === "anahataPosts") {
        // A legacy flat thumbnail gains a source wrapper; its alt and sibling
        // metadata remain where they were, and the renderer prefers source.
        const index = Number(path.split(".")[1]);
        const thumbnail = record(
            record((effective as any[])?.[index]).thumbnail,
        );
        base = put(effective, [String(index), "thumbnail"], thumbnail);
    }
    return { ...settings, [root]: put(base, path.split(".").slice(1), source) };
}
