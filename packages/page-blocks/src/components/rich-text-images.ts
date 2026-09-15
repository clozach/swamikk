import type { ImageSource, PageImageLeaf } from "@courselit/common-models";
import { normalizeImageSource, resolveImageSrc } from "./image-source";

/** Native TipTap image slots; content indexes retain the original document order. */
export function richTextImages(value: unknown, root: string): PageImageLeaf[] {
    const images: PageImageLeaf[] = [];
    function visit(node: any, path: string) {
        if (!node || typeof node !== "object") return;
        if (
            node.type === "image" &&
            typeof node.attrs?.src === "string" &&
            node.attrs.src.trim()
        ) {
            const saved = normalizeImageSource(node.attrs.kkImageSource);
            const source: ImageSource =
                saved && resolveImageSrc(saved) === node.attrs.src
                    ? saved
                    : { kind: "url", url: node.attrs.src };
            images.push({
                path: `${path}.attrs.kkImageSource`,
                label:
                    (typeof node.attrs.alt === "string" &&
                        node.attrs.alt.trim()) ||
                    `Article image ${images.length + 1}`,
                value: source,
            });
        }
        if (Array.isArray(node.content))
            node.content.forEach((child: unknown, index: number) =>
                visit(child, `${path}.content.${index}`),
            );
    }
    visit(value, root);
    return images;
}

/** Render-only annotation. Never written back to the native TipTap document. */
export function markRichTextImages(node: any, root: string): any {
    if (!node || typeof node !== "object") return node;
    return {
        ...node,
        ...(node.type === "image"
            ? {
                  attrs: {
                      ...node.attrs,
                      kkImagePath: `${root}.attrs.kkImageSource`,
                  },
              }
            : {}),
        ...(Array.isArray(node.content)
            ? {
                  content: node.content.map((child: unknown, index: number) =>
                      markRichTextImages(child, `${root}.content.${index}`),
                  ),
              }
            : {}),
    };
}
