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

interface TextRendererProps {
    json: TextEditorContent;
    className?: string;
    theme?: ThemeStyle;
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

export function TextRenderer({ json, className, theme }: TextRendererProps) {
    const extensions = createExtensions();
    const content = removeEmptyTextNodes(
        (json as any) ?? (emptyDoc as any),
    ) as TextEditorContent;

    const rendered = renderToReactElement({
        extensions,
        content,
        options: {
            nodeMapping: {
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
