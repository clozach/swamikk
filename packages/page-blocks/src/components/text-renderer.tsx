import React from "react";
import { renderToReactElement } from "@tiptap/static-renderer";
import {
    extractTextFromNode,
    emptyDoc,
    createExtensions,
    createId,
} from "@courselit/text-editor";
import type { ThemeStyle } from "@courselit/page-models";
import {
    Header1,
    Header2,
    Header3,
    Link,
    Text1,
} from "@courselit/page-primitives";
import { TextEditorContent } from "@courselit/common-models";
import { getImageProps } from "next/image";
import { markRichTextImages, richTextImages } from "./rich-text-images";

interface TextRendererProps {
    json: TextEditorContent;
    className?: string;
    theme?: ThemeStyle;
    imagePathRoot?: string;
}

function removeEmptyTextNodes(node: any): any {
    if (!node || typeof node !== "object") {
        return node;
    }

    if (node.type === "text" && node.text === "") {
        return undefined;
    }

    if (!Array.isArray(node.content)) {
        return node;
    }

    const content = node.content
        .map(removeEmptyTextNodes)
        .filter((child: any) => child !== undefined);

    return {
        ...node,
        content,
    };
}

export function TextRenderer({
    json,
    className,
    theme,
    imagePathRoot,
}: TextRendererProps) {
    const slots = new Map(
        imagePathRoot
            ? richTextImages(json, imagePathRoot).map((slot) => [
                  slot.path,
                  slot,
              ])
            : [],
    );
    const extensions = createExtensions().map((extension) =>
        imagePathRoot && extension.name === "image"
            ? extension.extend({
                  addAttributes() {
                      return {
                          ...this.parent?.(),
                          kkImagePath: { default: null },
                      };
                  },
              })
            : extension,
    );
    const content = removeEmptyTextNodes(
        (imagePathRoot ? markRichTextImages(json, imagePathRoot) : json) ??
            (emptyDoc as any),
    ) as TextEditorContent;

    const rendered = renderToReactElement({
        extensions,
        content,
        options: {
            nodeMapping: {
                ...(imagePathRoot
                    ? {
                          image: ({ node }: any) => {
                              const slot = slots.get(node.attrs.kkImagePath);
                              const src =
                                  slot?.value.kind === "media"
                                      ? getImageProps({
                                            src: node.attrs.src,
                                            alt: node.attrs.alt || "",
                                            width: 960,
                                            height: 640,
                                            quality: 75,
                                        }).props.src
                                      : node.attrs.src;
                              // Preserve native image geometry. A managed image negotiates
                              // AVIF/WebP through the same bounded public optimizer; no
                              // width descriptors claim pixels the original may not have.
                              return (
                                  <img
                                      data-kk-image-path={slot?.path}
                                      src={src}
                                      alt={node.attrs.alt || ""}
                                      title={node.attrs.title || undefined}
                                      width={node.attrs.width || undefined}
                                      height={node.attrs.height || undefined}
                                      loading="lazy"
                                      decoding="async"
                                      className="max-w-full h-auto rounded-md"
                                  />
                              );
                          },
                      }
                    : {}),
                text: ({ node, parent }) => {
                    const text = node.text ?? "";
                    const link = node.marks.find(
                        (mark) => mark.type.name === "link",
                    );
                    if (
                        !link ||
                        !/↗\s*$/.test(text) ||
                        parent?.type.spec.code ||
                        parent?.type.name === "codeMirror" ||
                        node.marks.some((mark) => mark.type.name === "code")
                    )
                        return text;

                    // Marks wrap this text node, preserving bold/italic and links.
                    // A following run in the same link makes this arrow mid-label.
                    let follows = false;
                    let continues = false;
                    parent?.forEach((sibling) => {
                        if (follows) {
                            continues = sibling.marks.some(
                                (mark) =>
                                    mark.type.name === "link" &&
                                    mark.attrs.href === link.attrs.href,
                            );
                            follows = false;
                        }
                        if (sibling === node) follows = true;
                    });
                    if (continues) return text;
                    const arrow = text.lastIndexOf("↗");
                    return (
                        <>
                            {text.slice(0, arrow).trimEnd()}
                            <sup className="ml-[0.18em] inline-block align-super text-[0.65em] leading-none">
                                ↗
                            </sup>
                            {text.slice(arrow + 1)}
                        </>
                    );
                },
                paragraph: ({ children }) => {
                    if (theme) {
                        return (
                            <Text1 theme={theme} component="p">
                                {children}
                            </Text1>
                        );
                    }
                    return <p>{children}</p>;
                },
                hardBreak: () => <br />,
                heading: ({ node, children }) => {
                    const level = node?.attrs?.level ?? 1;
                    // Extract text from the node structure (same as extractHeadings does)
                    const textContent = extractTextFromNode(node);
                    const id = createId(textContent);

                    if (!theme) {
                        const Tag =
                            `h${level}` as unknown as keyof JSX.IntrinsicElements;
                        return <Tag id={id}>{children}</Tag>;
                    }

                    if (level === 1) {
                        return (
                            <Header1 theme={theme} id={id}>
                                {children}
                            </Header1>
                        );
                    }
                    if (level === 2) {
                        return (
                            <Header2 theme={theme} id={id}>
                                {children}
                            </Header2>
                        );
                    }
                    return (
                        <Header3 theme={theme} id={id}>
                            {children}
                        </Header3>
                    );
                },
                codeMirror: ({ children }) => (
                    <pre>
                        <code>{children}</code>
                    </pre>
                ),
            },
            markMapping: {
                link: ({ mark, children, node }) => {
                    const href = mark?.attrs?.href;
                    return (
                        <Link theme={theme}>
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {children}
                            </a>
                        </Link>
                    );
                },
                highlight: ({ children }) => (
                    <mark className="bg-accent text-accent-foreground">
                        {children}
                    </mark>
                ),
            },
        },
    });

    const combinedClassName = ["tiptap-renderer", className]
        .filter(Boolean)
        .join(" ");

    return (
        <div className="text-editor flex flex-col gap-4">
            <div className={combinedClassName}>{rendered}</div>
        </div>
    );
}

export default TextRenderer;
