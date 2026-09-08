const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const { before, test } = require("node:test");

const root = path.resolve(__dirname, "../../..");
const web = createRequire(path.join(root, "apps/web/package.json"));
const build = createRequire(
    path.join(root, "packages/page-blocks/package.json"),
);
const esbuild = createRequire(build.resolve("tsup"))("esbuild");
const { JSDOM } = web("jsdom");
let renderer;

// Use the real source renderer, native editor extensions, and import documents.
// Bundling avoids Jest's CJS transform replacing the native ESM editor boundary.
before(async () => {
    const output = await esbuild.build({
        stdin: {
            contents: `
                import React from "react";
                import { renderToStaticMarkup } from "react-dom/server";
                import { TextRenderer } from "./packages/page-blocks/src/components/text-renderer";
                import { privateSessionsCreation, privateSessionsHomeDraft, privateSessionsFingerprint } from "./apps/web/.migrations/private-sessions-import";
                export const render = (json) => renderToStaticMarkup(<TextRenderer json={json} />);
                export const sessions = privateSessionsCreation().patch.content;
                const layout = [
                    { widgetId: "ayr-anahataPrivateSessions", name: "anahataPrivateSessions", settings: { buttonAction: "https://www.anahata-retreat.org.nz/stay/private-sessions" } },
                    { widgetId: "ayr-anahataPosts", name: "anahataPosts", settings: { posts: [{ id: "anahata-post-kumara-salad", thumbnail: { url: "https://www.anahata-retreat.org.nz/wp-content/uploads/2026/04/images-4.jpg" } }] } },
                    { widgetId: "ayr-anahataTour", name: "anahataTour", settings: {} },
                ];
                export const tour = privateSessionsHomeDraft(layout, {}, privateSessionsFingerprint({ layout, sharedWidgets: {} }))[2].settings.text;
            `,
            loader: "tsx",
            resolveDir: root,
        },
        bundle: true,
        write: false,
        platform: "node",
        target: "node22",
        format: "cjs",
        logLevel: "silent",
        external: ["react", "react-dom"],
        alias: {
            "@courselit/page-primitives": path.join(
                root,
                "packages/page-primitives/dist/index.mjs",
            ),
            "@": path.join(root, "apps/web"),
        },
        nodePaths: [
            path.join(root, "apps/web/node_modules"),
            path.join(root, "packages/page-blocks/node_modules"),
        ],
        loader: { ".css": "empty" },
    });
    const module = { exports: {} };
    new Function("require", "module", "exports", output.outputFiles[0].text)(
        web,
        module,
        module.exports,
    );
    renderer = module.exports;
});

const href = "https://example.org/source";
const link = { type: "link", attrs: { href } };
const text = (value, marks = [link]) => ({ type: "text", text: value, marks });
const doc = (content, type = "paragraph") => ({
    type: "doc",
    content: [{ type, content }],
});
const rendered = (json) => new JSDOM(renderer.render(json)).window.document;

function checkArrow(anchor, label, destination) {
    assert.ok(anchor);
    assert.equal(anchor.getAttribute("href"), destination);
    assert.equal(anchor.getAttribute("target"), "_blank");
    assert.equal(anchor.getAttribute("rel"), "noopener noreferrer");
    assert.equal(anchor.textContent, `${label}↗`);
    const arrow = anchor.querySelector("sup");
    assert.ok(arrow, "the existing terminal arrow is superscript");
    assert.equal(arrow.textContent, "↗");
    for (const value of [
        "ml-[0.18em]",
        "align-super",
        "text-[0.65em]",
        "leading-none",
    ])
        assert.ok(arrow.classList.contains(value), value);
}

test("actual Private Sessions import renders its existing source arrow close and superscript", () => {
    const document = rendered(renderer.sessions);
    checkArrow(
        document.querySelector(
            'a[href="https://www.anahata-retreat.org.nz/stay/private-sessions"]',
        ),
        "Original Private Sessions information at Anahata",
        "https://www.anahata-retreat.org.nz/stay/private-sessions",
    );
    assert.equal(document.querySelectorAll("sup").length, 1);
    assert.equal(
        document.querySelector('a[href^="mailto:"]').textContent,
        "Enquire about a session",
    );
});

test("actual homepage import renders the existing Tour arrow without changing its destination", () => {
    const document = rendered(renderer.tour);
    checkArrow(
        document.querySelector("a"),
        "Open Anahata’s virtual tour",
        "https://tour.anahata-retreat.org.nz/index.htm",
    );
    assert.equal(document.querySelectorAll("sup").length, 1);
});

test("bold and italic link wrappers and interior label spaces survive", () => {
    const document = rendered(
        doc([
            text("Original  source   ↗", [
                link,
                { type: "bold" },
                { type: "italic" },
            ]),
        ]),
    );
    checkArrow(document.querySelector("a"), "Original  source", href);
    assert.ok(document.querySelector("strong em sup, em strong sup"));
});

test("an arrow at a formatting boundary is not terminal when the same link continues", () => {
    const document = rendered(
        doc([text("Look ↗"), text(" here ↗", [link, { type: "bold" }])]),
    );
    assert.equal(document.querySelectorAll("sup").length, 1);
    assert.equal(document.querySelector("p").textContent, "Look ↗ here↗");
    assert.ok(document.querySelector("strong sup"));
});

test("separate adjacent links retain their own terminal arrows", () => {
    const other = { type: "link", attrs: { href: "https://example.net" } };
    const document = rendered(doc([text("One ↗"), text("Two ↗", [other])]));
    assert.equal(document.querySelectorAll("sup").length, 2);
    assert.equal(
        document.querySelectorAll("a")[1].getAttribute("href"),
        "https://example.net",
    );
});

test("absent arrows, mid-label arrows and unlinked arrows remain unchanged", () => {
    for (const node of [
        text("Ordinary link"),
        text("Look ↗ here"),
        text("Unlinked ↗", []),
    ]) {
        const document = rendered(doc([node]));
        assert.equal(document.querySelectorAll("sup").length, 0);
        assert.equal(document.querySelector("p").textContent, node.text);
    }
});

test("inline code and code blocks keep literal arrows", () => {
    for (const json of [
        doc([text("source ↗", [link, { type: "code" }])]),
        doc([text("source ↗")], "codeBlock"),
        doc([text("source ↗")], "codeMirror"),
    ]) {
        const document = rendered(json);
        assert.equal(document.querySelectorAll("sup").length, 0);
        assert.equal(document.querySelector("code").textContent, "source ↗");
    }
});
