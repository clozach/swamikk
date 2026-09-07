import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Reuse the workspace's existing tsup/esbuild dependency; no install or network request.
const workspaceRequire = createRequire(
    new URL("../../../../packages/common-logic/package.json", import.meta.url),
);
const { build } = createRequire(workspaceRequire.resolve("tsup"))("esbuild");
if (!process.argv[2]) throw new Error("Pass an output .mjs path.");
await build({
    entryPoints: [fileURLToPath(new URL("./cli.ts", import.meta.url))],
    outfile: resolve(process.argv[2]),
    tsconfig: fileURLToPath(new URL("../../tsconfig.json", import.meta.url)),
    alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) },
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    packages: "external",
});
