import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const webFile = fileURLToPath(
    new URL(
        "../../../apps/web/services/drip-admin/schedule.ts",
        import.meta.url,
    ),
);
const require = createRequire(webFile);
const ts = require("typescript");

test("server render entry resolves in the web app's current and modern TypeScript modes", () => {
    for (const moduleResolution of [
        ts.ModuleResolutionKind.Node10,
        ts.ModuleResolutionKind.Bundler,
    ]) {
        const result = ts.resolveModuleName(
            "@courselit/email-editor/render",
            webFile,
            { moduleResolution },
            ts.sys,
        );
        assert.match(
            result.resolvedModule?.resolvedFileName || "",
            /dist\/render\.d\.ts$/,
        );
    }
});

test("the built server entry renders the same four native email blocks", async () => {
    const { renderEmailToHtml, defaultEmail } = await import(
        "../dist/render.mjs"
    );
    const html = await renderEmailToHtml({
        email: {
            ...defaultEmail,
            content: [
                {
                    id: "text",
                    blockType: "text",
                    settings: { content: "A quiet practice" },
                },
                {
                    id: "link",
                    blockType: "link",
                    settings: {
                        text: "Open lesson",
                        url: "https://example.com/lesson",
                    },
                },
                { id: "separator", blockType: "separator", settings: {} },
                {
                    id: "image",
                    blockType: "image",
                    settings: {
                        src: "https://example.com/practice.jpg",
                        alt: "Practice",
                    },
                },
            ],
        },
    });
    assert.doesNotMatch(html, /<h1>Error:/);
    assert.match(html, /A quiet practice/);
    assert.match(html, /href="https:\/\/example\.com\/lesson"/);
    assert.match(html, /<hr/);
    assert.match(html, /src="https:\/\/example\.com\/practice\.jpg"/);
});
