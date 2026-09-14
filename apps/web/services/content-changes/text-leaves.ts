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
export const isRichTextDoc = (
    value: unknown,
): value is Record<string, unknown> =>
    isRecord(value) && value.type === "doc" && Array.isArray(value.content);
/** Block nodes a site manager may edit as one run, formatting kept. */
export const RICH_BLOCK_TYPES = new Set(["paragraph", "heading"]);
export const MAX_TEXT = 20000;
// eslint-disable-next-line no-control-regex
const controlCharacters = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

export const textKeyAllowed = (key: string) =>
    !denyKeys.has(key) && !denySuffix.test(key);

/** The words a rich-text node shows: its text nodes in order, a line break per hardBreak. */
export function richTextPlain(node: unknown): string {
    if (!isRecord(node)) return "";
    if (node.type === "text")
        return typeof node.text === "string" ? node.text : "";
    if (node.type === "hardBreak") return "\n";
    return Array.isArray(node.content)
        ? node.content.map(richTextPlain).join("")
        : "";
}

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
    if (typeof node.type === "string" && RICH_BLOCK_TYPES.has(node.type)) {
        const plain = richTextPlain(node);
        if (plain.trim() && plain.length <= MAX_TEXT)
            out.push({
                path: base,
                value: plain,
                kind: "rich-text-node",
                source,
                node: clone(node),
            });
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
 * its defaults for anything unset, plus every rich-text paragraph/heading as
 * a node entry. The registry is the walk itself, bounded by the deny lists
 * above; a path is only ever addressed if it appears here.
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

/** Copy the stored settings, pulling a default-derived top-level branch in whole first. */
function editableSettings(widget: WidgetInstance, top: string) {
    const settings = clone(widget.settings || {}) as Record<string, unknown>;
    if (settings[top] === undefined) {
        const defaults = defaultsFor(widget.name);
        requireCondition(
            defaults[top] !== undefined,
            "unsupported_target",
            "Choose a text field on the page.",
        );
        settings[top] = clone(defaults[top]);
    }
    return settings;
}

function resolveParent(settings: Record<string, unknown>, parts: string[]) {
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
    return node as Record<string, unknown> | unknown[];
}
const readAt = (parent: Record<string, unknown> | unknown[], key: string) =>
    Array.isArray(parent) ? parent[Number(key)] : parent[key];
const writeAt = (
    parent: Record<string, unknown> | unknown[],
    key: string,
    value: unknown,
) => {
    if (Array.isArray(parent)) parent[Number(key)] = value;
    else parent[key] = value;
};

/**
 * Write one string leaf into a copy of the stored settings. A default-derived
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
    const settings = editableSettings(widget, parts[0]);
    const parent = resolveParent(settings, parts);
    const last = parts[parts.length - 1];
    requireCondition(
        typeof readAt(parent, last) === "string",
        "unsupported_target",
        "Choose a text field on the page.",
    );
    writeAt(parent, last, value);
    return settings;
}

/** Replace one rich-text block node (paragraph or heading) inside a document setting. */
export function setRichTextNode(
    widget: WidgetInstance,
    path: string,
    node: unknown,
): Record<string, unknown> {
    const parts = parsePath(path);
    const settings = editableSettings(widget, parts[0]);
    requireCondition(
        isRichTextDoc(settings[parts[0]]) && parts.length >= 3,
        "unsupported_target",
        "Choose a paragraph on the page.",
    );
    const parent = resolveParent(settings, parts);
    const last = parts[parts.length - 1];
    const previous = readAt(parent, last);
    requireCondition(
        isRecord(previous) &&
            typeof previous.type === "string" &&
            RICH_BLOCK_TYPES.has(previous.type) &&
            isRecord(node) &&
            node.type === previous.type,
        "unsupported_target",
        "Choose a paragraph on the page.",
    );
    writeAt(parent, last, clone(node));
    return settings;
}

/** The current value at a path: a string leaf, or a rich-text node. */
export function readTextPath(widget: WidgetInstance, path: string): unknown {
    const parts = parsePath(path);
    const settings = clone(widget.settings || {}) as Record<string, unknown>;
    if (settings[parts[0]] === undefined)
        settings[parts[0]] = defaultsFor(widget.name)[parts[0]];
    let node: unknown = settings;
    for (const part of parts) {
        node = Array.isArray(node)
            ? node[Number(part)]
            : isRecord(node)
              ? node[part]
              : undefined;
        if (node === undefined) return undefined;
    }
    return node;
}

/** The rich-text document a path lives in, or undefined for plain text. */
export function richTextDocFor(
    settings: Record<string, unknown>,
    path: string,
): { key: string; doc: Record<string, unknown> } | undefined {
    const [key] = parsePath(path);
    const doc = settings[key];
    return isRichTextDoc(doc) ? { key, doc } : undefined;
}

/**
 * A paragraph that carries its link words in a sibling (`{ text, linkText }`,
 * the hero's shape) must keep those words inside its text, or the link would
 * silently vanish. Checked after every change in an edit has landed, on the
 * objects the changed paths belong to.
 */
export function assertLinkWordsKept(
    settings: Record<string, unknown>,
    paths: string[],
) {
    for (const path of paths) {
        const parts = parsePath(path);
        if (parts.length < 2) continue;
        let node: unknown = settings;
        for (const part of parts.slice(0, -1))
            node = Array.isArray(node)
                ? node[Number(part)]
                : isRecord(node)
                  ? node[part]
                  : undefined;
        if (!isRecord(node)) continue;
        const { text, linkText } = node;
        if (typeof text !== "string" || typeof linkText !== "string") continue;
        requireCondition(
            !linkText.trim() || text.includes(linkText),
            "link_changed",
            "Keep the linked words inside this paragraph; changing the link itself needs the page builder.",
        );
    }
}

export function validateReplacement(after: string) {
    requireCondition(
        typeof after === "string" && after.length <= MAX_TEXT,
        "bad_request",
        "Keep this text within 20,000 characters.",
    );
    // A value the registry would refuse to list could never be undone from here.
    requireCondition(
        !looksLikeAddress(after),
        "bad_request",
        "This reads as a web address. Links change in the page builder.",
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
