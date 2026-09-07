import type { WidgetInstance } from "@courselit/common-models";
import * as hero from "../../../../packages/page-blocks/src/blocks/anahata-hero/defaults";
import type { PageWidgetField, PageWidgetSnapshot } from "./page-types";
import { requireCondition } from "./errors";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const imageFields = ["bannerImage", "wordmark", "photo"] as const;

/** Explicit field registry, never an arbitrary property path or selector evaluator. */
export function pageWidgetFields(widget: WidgetInstance): PageWidgetField[] {
    if (widget.shared) return [];
    const settings = widget.settings || {};
    const result: PageWidgetField[] = [];
    const add = (
        field: string,
        kind: PageWidgetField["kind"],
        label: string,
        fallback?: unknown,
    ) => {
        const value =
            settings[field] === undefined ? fallback : settings[field];
        if (value !== undefined)
            result.push({
                field,
                kind,
                label,
                value: clone(value),
                defaultDerived: settings[field] === undefined,
            });
    };
    if (widget.name === "rich-text") add("text", "rich-text", "Text");
    if (widget.name === "content") {
        add("title", "text", "Heading");
        add("description", "rich-text", "Description");
    }
    if (
        widget.name === "media" &&
        !settings.youtubeLink &&
        (settings.media as { mimeType?: string })?.mimeType?.startsWith(
            "image/",
        )
    )
        add("media", "image", "Image");
    if (widget.name === "anahataHero") {
        add("heading", "text", "Welcome heading", hero.heading);
        if (String(settings.ctaCaption ?? hero.ctaCaption).trim())
            add("ctaCaption", "text", "Button text", hero.ctaCaption);
        for (const field of imageFields)
            add(
                field,
                "image",
                field === "bannerImage"
                    ? "Banner fallback image"
                    : field === "wordmark"
                      ? "Wordmark image"
                      : "Welcome image",
                hero[field],
            );
        const paragraphs =
            settings.paragraphs === undefined
                ? hero.paragraphs
                : settings.paragraphs;
        if (Array.isArray(paragraphs))
            paragraphs.forEach((paragraph, index) => {
                if (typeof paragraph?.text === "string")
                    result.push({
                        field: `paragraph:${index}`,
                        kind: "text",
                        label: `Paragraph ${index + 1}`,
                        value: paragraph.text,
                        defaultDerived: settings.paragraphs === undefined,
                    });
            });
    }
    return result;
}
export function pageField(widget: WidgetInstance, field: string) {
    const result = pageWidgetFields(widget).find(
        (item) => item.field === field,
    );
    requireCondition(
        result,
        "unsupported_target",
        "Choose a supported text or image field in a non-shared page block.",
        400,
    );
    return result;
}
export function pagePreviewSettings(widget: WidgetInstance) {
    const defaults =
        widget.name === "anahataHero"
            ? Object.fromEntries(
                  Object.entries(hero).filter(([key]) => /^[a-z]/.test(key)),
              )
            : {};
    return clone({ ...defaults, ...(widget.settings || {}) });
}
export function pageWidgetSnapshot(
    widget: WidgetInstance,
    field: string,
): PageWidgetSnapshot {
    const value = pageField(widget, field);
    return {
        kind: "page-widget",
        widget: clone(widget),
        fieldValue: value.value,
        renderSettings: pagePreviewSettings(widget),
        defaultDerived: value.defaultDerived,
        rotatingFallback:
            widget.name === "anahataHero" &&
            field === "bannerImage" &&
            ((widget.settings?.bannerMode as { kind?: string })?.kind ||
                hero.bannerMode.kind) === "social-rotation",
    };
}
