import type { WidgetInstance, WidgetMetadata } from "@courselit/common-models";
import {
    defaultsFor,
    richTextPlain,
} from "@/services/content-changes/text-leaves";
import hero from "../../../../packages/page-blocks/src/blocks/anahata-hero/metadata";
import tour from "../../../../packages/page-blocks/src/blocks/anahata-tour/metadata";
import privateSessions from "../../../../packages/page-blocks/src/blocks/anahata-private-sessions/metadata";
import gatherings from "../../../../packages/page-blocks/src/blocks/anahata-gatherings/metadata";
import posts from "../../../../packages/page-blocks/src/blocks/anahata-posts/metadata";
import newsletter from "../../../../packages/page-blocks/src/blocks/anahata-newsletter/metadata";
import richText from "../../../../packages/page-blocks/src/blocks/rich-text/metadata";
import { DEFAULT_HEADING as newsletterHeading } from "../../../../packages/page-blocks/src/blocks/anahata-newsletter/defaults";

type HeadingRule = { metadata: WidgetMetadata; key: "heading" | "title" };
const headings: Record<string, HeadingRule> = Object.fromEntries(
    [
        { metadata: hero, key: "heading" },
        { metadata: tour, key: "heading" },
        { metadata: privateSessions, key: "heading" },
        { metadata: gatherings, key: "title" },
        { metadata: posts, key: "heading" },
        { metadata: newsletter, key: "heading" },
    ].map((entry) => [entry.metadata.name, entry]),
) as Record<string, HeadingRule>;

const text = (value: unknown) =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/** The first saved Tiptap heading, with inline formatting joined as rendered words. */
function richHeading(node: unknown, depth = 0): string {
    if (!isRecord(node) || depth > 32) return "";
    if (node.type === "heading") {
        const label = text(richTextPlain(node));
        if (label) return label;
    }
    if (Array.isArray(node.content)) {
        for (const child of node.content) {
            const label = richHeading(child, depth + 1);
            if (label) return label;
        }
    }
    return "";
}

/** Unknown block kinds still get words, without exposing camelCase implementation names. */
function readableName(name: string) {
    const label = text(
        name
            .replace(/^anahata(?=[A-Z_-])/, "")
            .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
            .replace(/([a-z\d])([A-Z])/g, "$1 $2")
            .replace(/[-_]+/g, " "),
    );
    return label ? label[0].toUpperCase() + label.slice(1) : "Untitled";
}

export function sectionLabel(widget: WidgetInstance): string {
    const settings = widget.settings || {};
    let label = "";
    if (widget.name === richText.name) {
        // This renderer reads settings.text only; stale top-level heading fields do not render.
        label = richHeading(settings.text) || richText.displayName;
    } else {
        const rule = headings[widget.name];
        if (rule) {
            // Match the widget's actual fallback semantics. Newsletter uses ??;
            // the other five use a destructuring default, only for undefined.
            const saved = settings[rule.key];
            const shown =
                widget.name === newsletter.name
                    ? (saved ?? newsletterHeading)
                    : saved === undefined
                      ? defaultsFor(widget.name)[rule.key]
                      : saved;
            label = text(shown) || rule.metadata.displayName;
        } else {
            label =
                ["heading", "title", "name", "kicker"]
                    .map((key) => text(settings[key]))
                    .find(Boolean) || readableName(widget.name);
        }
    }
    return Array.from(label).slice(0, 160).join("");
}
