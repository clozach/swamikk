import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const blocksRoot = path.resolve(web, "../../packages/page-blocks/src/blocks");
const components = new Map();
function load(file, imports = {}) {
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const exports = {};
    const resolve = (name) => {
        if (imports[name]) return imports[name];
        if (name === "@courselit/common-models")
            return {
                Constants: {
                    PageType: {
                        SITE: "site",
                        PRODUCT: "product",
                        BLOG: "blog",
                        COMMUNITY: "community",
                    },
                },
            };
        if (name === "./metadata")
            return load(path.join(path.dirname(file), "metadata.ts"));
        // Component rendering is verified separately. Preserve each module's
        // identity while testing the real metadata exports and native registry.
        if (["./widget", "./admin-widget"].includes(name)) {
            const key = path.resolve(path.dirname(file), name);
            if (!components.has(key))
                components.set(key, { default: Symbol(key) });
            return components.get(key);
        }
        throw new Error(`Unexpected dependency ${name} in ${file}`);
    };
    new Function("exports", "require", source)(exports, resolve);
    return exports;
}

test("every exported page block resolves by the name saved on native pages", () => {
    const exports = {};
    for (const [, folder] of readFileSync(
        path.join(blocksRoot, "index.tsx"),
        "utf8",
    ).matchAll(/export \* from "\.\/([^"]+)"/g)) {
        const stem = path.join(blocksRoot, folder, "index");
        Object.assign(
            exports,
            load(existsSync(stem + ".ts") ? stem + ".ts" : stem + ".tsx"),
        );
    }
    const { default: widgets } = load(path.join(web, "ui-config/widgets.tsx"), {
        "@courselit/page-blocks": exports,
    });
    assert.ok(Object.keys(exports).length > 20);
    for (const block of Object.values(exports)) {
        assert.equal(
            widgets[block.metadata.name]?.widget,
            block.widget,
            `${block.metadata.name} must render in native pages`,
        );
    }
});
