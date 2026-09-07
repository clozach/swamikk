import type { TextEditorContent } from "@courselit/common-models";
import { requireCondition } from "./errors";
import { stableJson } from "./stable";

const editableNodes = new Set([
    "doc",
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "codeBlock",
    "hardBreak",
    "horizontalRule",
    "text",
]);
const editableMarks = new Set([
    "bold",
    "italic",
    "strike",
    "underline",
    "code",
    "link",
]);

export function validateTextEdit(
    before: TextEditorContent,
    after: TextEditorContent,
) {
    const opaqueBefore: string[] = [];
    const opaqueAfter: string[] = [];
    let nodes = 0;
    const visit = (
        value: unknown,
        opaque: string[],
        depth: number,
        validate: boolean,
    ) => {
        requireCondition(
            depth <= 20 && ++nodes <= 20_000,
            "unsupported_content",
            "This text is too complex for a direct edit.",
        );
        requireCondition(
            value && typeof value === "object" && !Array.isArray(value),
            "bad_request",
            "Invalid text structure.",
        );
        const node = value as Record<string, any>;
        if (!editableNodes.has(node.type)) {
            opaque.push(stableJson(node));
            return;
        }
        if (validate) {
            requireCondition(
                Object.keys(node).every((key) =>
                    ["type", "content", "text", "attrs", "marks"].includes(key),
                ),
                "unsupported_content",
                "Unsupported text properties.",
            );
            if (node.type === "text")
                requireCondition(
                    typeof node.text === "string",
                    "bad_request",
                    "Text nodes require text.",
                );
            for (const [key, val] of Object.entries(node.attrs || {})) {
                const valid =
                    (key === "level" &&
                        Number.isInteger(val) &&
                        Number(val) >= 1 &&
                        Number(val) <= 6) ||
                    (key === "start" &&
                        Number.isInteger(val) &&
                        Number(val) >= 1 &&
                        Number(val) <= 10000) ||
                    (key === "textAlign" &&
                        [null, "left", "right", "center", "justify"].includes(
                            val as string,
                        )) ||
                    (key === "language" &&
                        (val === null ||
                            (typeof val === "string" &&
                                /^[\w+-]{0,40}$/.test(val))));
                requireCondition(
                    valid,
                    "unsupported_content",
                    "Unsupported text formatting.",
                );
            }
            requireCondition(
                node.marks === undefined || Array.isArray(node.marks),
                "bad_request",
                "Invalid text formatting.",
            );
            for (const mark of node.marks || []) {
                requireCondition(
                    mark &&
                        editableMarks.has(mark.type) &&
                        Object.keys(mark).every((key) =>
                            ["type", "attrs"].includes(key),
                        ),
                    "unsupported_content",
                    "Unsupported text formatting.",
                );
                if (mark.type === "link") {
                    requireCondition(
                        typeof mark.attrs?.href === "string" &&
                            /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(
                                mark.attrs.href,
                            ) &&
                            !/[\x00-\x20]/.test(mark.attrs.href),
                        "bad_request",
                        "Use a safe link address.",
                    );
                    requireCondition(
                        Object.keys(mark.attrs).every((key) =>
                            ["href", "target", "rel", "class"].includes(key),
                        ),
                        "unsupported_content",
                        "Unsupported link formatting.",
                    );
                    requireCondition(
                        Object.values(mark.attrs).every(
                            (val) =>
                                val === null ||
                                (typeof val === "string" && val.length <= 2000),
                        ),
                        "bad_request",
                        "Invalid link formatting.",
                    );
                } else
                    requireCondition(
                        !mark.attrs || Object.keys(mark.attrs).length === 0,
                        "unsupported_content",
                        "Unsupported text formatting.",
                    );
            }
        }
        requireCondition(
            node.content === undefined || Array.isArray(node.content),
            "bad_request",
            "Invalid text structure.",
        );
        for (const child of node.content || [])
            visit(child, opaque, depth + 1, validate);
    };
    visit(before, opaqueBefore, 0, false);
    visit(after, opaqueAfter, 0, true);
    requireCondition(
        stableJson(opaqueBefore.sort()) === stableJson(opaqueAfter.sort()),
        "unsupported_content",
        "This edit must retain existing media and embedded content. Use the content editor for asset changes.",
    );
}
