import { render } from "@testing-library/react";
import { TextRenderer } from "../../../../../packages/page-blocks/src/components/text-renderer";

// Use the real ProseMirror/static renderer with the small image-document
// schema needed here. The editor's unrelated CodeMirror/lowlight UI cannot
// load through this Jest environment's ESM interop.
jest.mock("@courselit/text-editor", () => {
    const { Node } = jest.requireActual("@tiptap/core");
    return {
        createExtensions: () => [
            Node.create({ name: "doc", topNode: true, content: "block+" }),
            Node.create({ name: "text", group: "inline" }),
            Node.create({
                name: "paragraph",
                group: "block",
                content: "inline*",
                renderHTML: () => ["p", 0],
            }),
            Node.create({
                name: "blockquote",
                group: "block",
                content: "block+",
                renderHTML: () => ["blockquote", 0],
            }),
            Node.create({
                name: "image",
                group: "block",
                atom: true,
                addAttributes: () =>
                    Object.fromEntries(
                        ["src", "alt", "title", "width", "height"].map(
                            (key) => [key, { default: null }],
                        ),
                    ),
                renderHTML: ({ HTMLAttributes }: any) => [
                    "img",
                    HTMLAttributes,
                ],
            }),
        ],
        emptyDoc: { type: "doc", content: [] },
        createId: (text: string) => text,
        extractTextFromNode: () => "",
    };
});

describe("embedded image rendering", () => {
    it("keeps original nested paths through empty-text filtering and repeated renders", () => {
        const image = {
            type: "image",
            attrs: {
                src: "/anahata/original.jpg",
                alt: "Portrait",
                title: "Kept title",
                width: 280,
                height: 400,
            },
        };
        const json: any = {
            type: "doc",
            content: [
                { type: "text", text: "" },
                image,
                { type: "blockquote", content: [image] },
            ],
        };
        const { container, rerender } = render(
            <TextRenderer json={json} imagePathRoot="text" />,
        );
        const read = () =>
            Array.from(container.querySelectorAll("img")).map((img) => ({
                path: img.getAttribute("data-kk-image-path"),
                src: img.getAttribute("src"),
                title: img.title,
                width: img.getAttribute("width"),
                height: img.getAttribute("height"),
            }));
        const expected = [
            "text.content.1.attrs.kkImageSource",
            "text.content.2.content.0.attrs.kkImageSource",
        ].map((path) => ({
            path,
            src: "/anahata/original.jpg",
            title: "Kept title",
            width: "280",
            height: "400",
        }));
        expect(read()).toEqual(expected);
        rerender(<TextRenderer json={json} imagePathRoot="text" />);
        expect(read()).toEqual(expected);
        expect(image.attrs).not.toHaveProperty("kkImagePath");
    });

    it("delivers managed pictures through the optimizer without changing native geometry or leaking metadata", () => {
        const source = {
            kind: "media",
            media: { mediaId: "managed", file: "/anahata/managed.jpg" },
        };
        const json: any = {
            type: "doc",
            content: [
                {
                    type: "image",
                    attrs: {
                        src: source.media.file,
                        alt: "Portrait",
                        width: 280,
                        height: 400,
                        kkImageSource: source,
                    },
                },
            ],
        };
        const { container } = render(
            <TextRenderer json={json} imagePathRoot="text" />,
        );
        const img = container.querySelector("img")!;
        expect(img.getAttribute("src")).toContain("/_next/image?url=");
        expect(img.getAttribute("src")).toContain("w=1920");
        expect(img.getAttribute("srcset")).toBeNull();
        expect(img.getAttribute("width")).toBe("280");
        expect(img.getAttribute("height")).toBe("400");
        expect(img.getAttribute("loading")).toBe("lazy");
        expect(img.outerHTML).not.toContain("mediaId");
    });
});
