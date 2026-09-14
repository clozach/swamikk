import type { WidgetInstance, TextLeaf } from "@courselit/common-models";
import * as hero from "../../../../packages/page-blocks/src/blocks/anahata-hero/defaults";
import * as header from "../../../../packages/page-blocks/src/blocks/anahata-header/defaults";
import * as footer from "../../../../packages/page-blocks/src/blocks/anahata-footer/defaults";
import * as gatherings from "../../../../packages/page-blocks/src/blocks/anahata-gatherings/defaults";
import * as newsletter from "../../../../packages/page-blocks/src/blocks/anahata-newsletter/defaults";
import * as posts from "../../../../packages/page-blocks/src/blocks/anahata-posts/defaults";
import * as privateSessions from "../../../../packages/page-blocks/src/blocks/anahata-private-sessions/defaults";
import * as tour from "../../../../packages/page-blocks/src/blocks/anahata-tour/defaults";
import { requireCondition } from "./errors";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/** A block's content defaults: the lowercase exports of its defaults module (the hero registry's rule). */
const lowercase = (module: Record<string, unknown>) =>
    clone(
        Object.fromEntries(
            Object.entries(module).filter(
                ([key, value]) =>
                    /^[a-z]/.test(key) && typeof value !== "function",
            ),
        ),
    );
export const blockDefaults: Record<string, Record<string, unknown>> = {
    anahataHero: lowercase(hero),
    anahataHeader: lowercase(header),
    anahataFooter: lowercase(footer),
    anahataGatherings: lowercase(gatherings),
    anahataNewsletter: lowercase(newsletter),
    anahataPosts: lowercase(posts),
    anahataPrivateSessions: lowercase(privateSessions),
    anahataTour: lowercase(tour),
};
export const defaultsFor = (name: string): Record<string, unknown> =>
    clone(blockDefaults[name] || {});

/** Keys that hold addresses, identities or presentation, never visible prose. */
const denyKeys = new Set([
    "id",
    "kind",
    "href",
    "url",
    "src",
    "file",
    "thumbnail",
    "mediaId",
    "platform",
    "mimeType",
    "type",
    "access",
    "alt",
    "target",
    "rel",
    "className",
    "class",
    "color",
    "level",
    "start",
    "textAlign",
    "mode",
    "variant",
    "icon",
    "slug",
    "path",
    "key",
    "width",
    "height",
    "originalFileName",
    "linkText",
]);
const denySuffix =
    /(Href|Url|Src|Id|Color|Colour|Mode|Kind|Icon|Class|Width|Height|Size|Font|Align|Style|Variant|Key|Slug|Path|Position)$/;
const looksLikeAddress = (value: string) =>
    /^(https?:\/\/|mailto:|tel:|#|\/[^\s]*$)/i.test(value.trim());
const imageSourceKinds = new Set(["url", "media", "placeholder"]);
/** Image sources and media objects are not prose containers. */
const isOpaqueContainer = (value: Record<string, unknown>) =>
    (typeof value.kind === "string" && imageSourceKinds.has(value.kind)) ||
    typeof value.mediaId === "string" ||
    typeof value.mimeType === "string";
const isRichTextDoc = (value: unknown): value is Record<string, unknown> =>
    isRecord(value) && value.type === "doc" && Array.isArray(value.content);
export const MAX_TEXT = 20000;
// eslint-disable-next-line no-control-regex
const controlCharacters = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

export const textKeyAllowed = (key: string) =>
    !denyKeys.has(key) && !denySuffix.test(key);

function richTextLeaves(
    node: Record<string, unknown>,
    base: string,
    out: TextLeaf[],
    source: TextLeaf["source"],
) {
    if (node.type === "text") {
        if (
            typeof node.text === "string" &&
            node.text.trim() &&
            node.text.length <= MAX_TEXT
        )
            out.push({
                path: `${base}.text`,
                value: node.text,
                kind: "rich-text-leaf",
                source,
            });
        return;
    }
    if (Array.isArray(node.content))
        node.content.forEach((child, index) => {
            if (isRecord(child))
                richTextLeaves(child, `${base}.content.${index}`, out, source);
        });
}

function walk(
    value: unknown,
    base: string,
    key: string,
    out: TextLeaf[],
    source: TextLeaf["source"],
    depth: number,
) {
    if (depth > 12) return;
    if (typeof value === "string") {
        if (
            key &&
            textKeyAllowed(key) &&
            value.trim() &&
            value.length <= MAX_TEXT &&
            !looksLikeAddress(value)
        )
            out.push({ path: base, value, kind: "text", source });
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            walk(item, `${base}.${index}`, key, out, source, depth + 1),
        );
        return;
    }
    if (!isRecord(value) || isOpaqueContainer(value)) return;
    if (isRichTextDoc(value)) {
        if (!key || textKeyAllowed(key))
            richTextLeaves(value, base, out, source);
        return;
    }
    for (const [childKey, child] of Object.entries(value))
        walk(
            child,
            base ? `${base}.${childKey}` : childKey,
            childKey,
            out,
            source,
            depth + 1,
        );
}

/**
 * Every visible string a block can show, from its stored settings first and
 * its defaults for anything unset. The registry is the walk itself, bounded by
 * the deny lists above; a path is only ever addressed if it appears here.
 */
export function widgetTextLeaves(widget: WidgetInstance): TextLeaf[] {
    const settings = widget.settings || {};
    const defaults = defaultsFor(widget.name);
    const out: TextLeaf[] = [];
    for (const [key, value] of Object.entries(settings))
        walk(value, key, key, out, "settings", 0);
    for (const [key, value] of Object.entries(defaults))
        if (settings[key] === undefined)
            walk(value, key, key, out, "default", 0);
    return out;
}

const segment = /^[A-Za-z0-9_-]+$/;
export function parsePath(path: string): string[] {
    const parts = path.split(".");
    requireCondition(
        path.length <= 300 &&
            parts.length >= 1 &&
            parts.length <= 24 &&
            parts.every((part) => segment.test(part)),
        "bad_request",
        "Choose a text field on the page.",
    );
    return parts;
}

/**
 * Write one leaf into a copy of the stored settings. A default-derived
 * branch is copied whole from the defaults first, so an edit inside a default
 * list (the hero paragraphs, a footer column) stores the complete list, the
 * way the builder would.
 */
export function setTextLeaf(
    widget: WidgetInstance,
    path: string,
    value: string,
): Record<string, unknown> {
    const parts = parsePath(path);
    const settings = clone(widget.settings || {}) as Record<string, unknown>;
    const defaults = defaultsFor(widget.name);
    if (settings[parts[0]] === undefined) {
        requireCondition(
            defaults[parts[0]] !== undefined,
            "unsupported_target",
            "Choose a text field on the page.",
        );
        settings[parts[0]] = clone(defaults[parts[0]]);
    }
    let node: unknown = settings;
    for (const part of parts.slice(0, -1)) {
        node = Array.isArray(node)
            ? node[Number(part)]
            : isRecord(node)
              ? node[part]
              : undefined;
        requireCondition(
            node !== undefined,
            "unsupported_target",
            "Choose a text field on the page.",
        );
    }
    const last = parts[parts.length - 1];
    const parent = node as Record<string, unknown> | unknown[];
    const previous = Array.isArray(parent)
        ? parent[Number(last)]
        : parent[last];
    requireCondition(
        typeof previous === "string",
        "unsupported_target",
        "Choose a text field on the page.",
    );
    // The hero's paragraphs carry their link words in a sibling; keep them.
    if (last === "text" && isRecord(parent)) {
        const linkText = parent.linkText;
        requireCondition(
            typeof linkText !== "string" ||
                !linkText.trim() ||
                value.includes(linkText),
            "link_changed",
            "Keep the existing linked words in this paragraph; changing the link needs a separate review.",
        );
    }
    if (Array.isArray(parent)) parent[Number(last)] = value;
    else parent[last] = value;
    return settings;
}

/** The rich-text document a leaf path lives in, or undefined for plain text. */
export function richTextDocFor(
    settings: Record<string, unknown>,
    path: string,
): { key: string; doc: Record<string, unknown> } | undefined {
    const [key] = parsePath(path);
    const doc = settings[key];
    return isRichTextDoc(doc) ? { key, doc } : undefined;
}

export function validateReplacement(after: string) {
    requireCondition(
        typeof after === "string" && after.length <= MAX_TEXT,
        "bad_request",
        "Keep this text within 20,000 characters.",
    );
    requireCondition(
        !!after.trim(),
        "empty_text",
        "Text cannot be emptied here. Use the page builder to remove it.",
    );
    requireCondition(
        !controlCharacters.test(after),
        "bad_request",
        "Remove the control characters from this text.",
    );
}
