import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseConfiguration, loadConfiguration } from "./config.mjs";
import { runCli } from "./cli.mjs";
import { ReviewError } from "./protocol.mjs";
import { temporary } from "./test-fixtures.mjs";

const settings = {
    site: "https://site.example",
    modelUrl: "https://model.example/v1/chat/completions",
    model: "chosen-model",
    maxCompletionTokens: 512,
    requestTimeoutMs: 1000,
    grantFile: "/private/grant",
    apiKeyFile: "/private/key",
    journalDirectory: "/private/state",
};
const parse = (value) => parseConfiguration(JSON.stringify(value));
async function files(t) {
    const dir = await temporary(t),
        cfg = {
            ...settings,
            grantFile: path.join(dir, "grant"),
            apiKeyFile: path.join(dir, "key"),
            journalDirectory: path.join(dir, "state"),
        },
        configFile = path.join(dir, "config.json");
    await fs.mkdir(cfg.journalDirectory, { mode: 0o700 });
    await fs.writeFile(cfg.grantFile, "fixture-site-grant-123\n", {
        mode: 0o600,
    });
    await fs.writeFile(cfg.apiKeyFile, "fixture-model-key-456\n", {
        mode: 0o600,
    });
    const save = () =>
        fs.writeFile(configFile, JSON.stringify(cfg), { mode: 0o600 });
    await save();
    return { dir, cfg, configFile, save };
}

test("requires explicit provider/model/bounds and rejects duplicate or unknown configuration", () => {
    assert.deepEqual(parse(settings), settings);
    for (const field of Object.keys(settings)) {
        const value = { ...settings };
        delete value[field];
        assert.throws(() => parse(value));
    }
    for (const value of [
        { ...settings, spending: "unlimited" },
        { ...settings, model: null },
        { ...settings, model: "contains spaces" },
        { ...settings, maxCompletionTokens: 4097 },
        { ...settings, maxCompletionTokens: 0 },
        { ...settings, maxCompletionTokens: 1.1 },
        { ...settings, requestTimeoutMs: 45001 },
        { ...settings, requestTimeoutMs: 999 },
        { ...settings, allowLocalTestHttp: "true" },
    ])
        assert.throws(() => parse(value));
    const duplicate = JSON.stringify(settings).replace(
        '"site":',
        '"s\\u0069te":"https://other.example","site":',
    );
    assert.throws(() => parseConfiguration(duplicate), {
        code: "config-duplicate-field",
    });
    assert.throws(() => parseConfiguration("[]"));
});

test("destinations cannot hide credentials, query strings, noncanonical hosts or redirects in config", () => {
    for (const site of [
        "https://user:pass@site.example",
        "https://site.example/a",
        "https://site.example/?token=key",
        "https://site.example/#x",
        "http://site.example",
        "file:///private",
        "https://site.example\\@evil.example",
        " https://site.example",
    ])
        assert.throws(() => parse({ ...settings, site }));
    for (const modelUrl of [
        "https://model.example/",
        "https://u:p@model.example/v1/chat/completions",
        "https://model.example/v1/chat/completions?key=x",
        "https://model.example/v1/../chat",
        "http://model.example/v1/chat/completions",
        "https://model.example/v1/chat/completions?",
        "https://model.example/v1/chat/completions#",
    ])
        assert.throws(() => parse({ ...settings, modelUrl }));
    assert.throws(() => parse({ ...settings, site: "http://localhost:3001" }));
    assert.equal(
        parse({
            ...settings,
            site: "http://localhost:3001",
            modelUrl: "http://127.0.0.1:9009/v1/chat/completions",
            allowLocalTestHttp: true,
        }).site,
        "http://localhost:3001",
    );
    assert.throws(() =>
        parse({
            ...settings,
            site: "http://2130706433:3001",
            allowLocalTestHttp: true,
        }),
    );
    assert.throws(() =>
        parse({
            ...settings,
            site: "http://example.com",
            allowLocalTestHttp: true,
        }),
    );
});

test("loads only private separate files outside repositories, with bounded tokens", async (t) => {
    const f = await files(t),
        value = await loadConfiguration(f.configFile);
    assert.equal(value.grant, "fixture-site-grant-123");
    assert.equal(value.modelKey, "fixture-model-key-456");
    assert.equal(value.maxTokens, 512);
    assert.equal(value.requestTimeoutMs, 1000);
    await fs.chmod(f.cfg.apiKeyFile, 0o644);
    await assert.rejects(loadConfiguration(f.configFile), {
        code: "private-path-permissions",
    });
    await fs.chmod(f.cfg.apiKeyFile, 0o600);
    await fs.writeFile(f.cfg.apiKeyFile, "valid-looking-key-123\nextra");
    await assert.rejects(loadConfiguration(f.configFile), {
        code: "private-token-format",
    });
    await fs.writeFile(f.cfg.apiKeyFile, "fixture-model-key-456");
    await fs.mkdir(path.join(f.dir, ".git"));
    await assert.rejects(loadConfiguration(f.configFile), {
        code: "private-path-in-repository",
    });
});

test("refuses symbolic/hardlinked inputs, overlapping journal, oversized config and short tokens", async (t) => {
    const f = await files(t),
        original = f.cfg.apiKeyFile;
    const link = path.join(f.dir, "link");
    await fs.symlink(original, link);
    f.cfg.apiKeyFile = link;
    await f.save();
    await assert.rejects(loadConfiguration(f.configFile), {
        code: "private-path-symlink",
    });
    f.cfg.apiKeyFile = original;
    await f.save();
    await fs.unlink(link);
    await fs.link(original, link);
    await assert.rejects(loadConfiguration(f.configFile), {
        code: "private-path-permissions",
    });
    await fs.unlink(link);
    f.cfg.apiKeyFile = f.cfg.grantFile;
    await f.save();
    await assert.rejects(loadConfiguration(f.configFile), {
        code: "private-input-paths-must-differ",
    });
    f.cfg.apiKeyFile = path.join(f.cfg.journalDirectory, "key");
    await fs.rename(original, f.cfg.apiKeyFile);
    await f.save();
    await assert.rejects(loadConfiguration(f.configFile), {
        code: "private-input-in-journal",
    });
    await fs.writeFile(f.configFile, " ".repeat(16385));
    await assert.rejects(loadConfiguration(f.configFile), {
        code: "private-file-changed-or-large",
    });
});

test("CLI is unconfigured by default and cannot emit provider or private journal errors", async () => {
    const noWork = () => assert.fail("configuration must not load");
    for (const args of [
        [],
        ["--provider", "x"],
        ["run-once", "--config", "/private", "--auto-publish"],
    ])
        assert.equal(
            (await runCli(args, { loadConfiguration: noWork })).exitCode,
            2,
        );
    let closed = 0;
    const dependencies = {
        loadConfiguration: async () => ({
            journalDirectory: "/private",
            grant: "secret-grant",
            modelKey: "secret-key",
            requestTimeoutMs: 1000,
        }),
        privateJournal: async () => ({
            close: async () => {
                closed++;
            },
        }),
        siteClient: () => undefined,
        modelClient: () => undefined,
        runOnce: async () => {
            throw Error("secret-key http://private-token");
        },
    };
    const failed = await runCli(
        ["run-once", "--config", "/private/config"],
        dependencies,
    );
    assert.equal(failed.exitCode, 1);
    assert.equal(failed.output.code, "runner-unconfirmed");
    assert.equal(closed, 1);
    assert(!JSON.stringify(failed).includes("secret-key"));
    dependencies.runOnce = async () => {
        throw new ReviewError("journal-credential-mismatch");
    };
    assert.equal(
        (
            await runCli(
                ["run-once", "--config", "/private/config"],
                dependencies,
            )
        ).output.code,
        "journal-credential-mismatch",
    );
    dependencies.runOnce = async () => ({
        kind: "confirmed",
        receipt: {
            outcome: "text-proposal",
            feedbackId: "private-record",
            text: "private-copy",
        },
    });
    const passed = await runCli(
        ["run-once", "--config", "/private/config"],
        dependencies,
    );
    assert.deepEqual(passed, {
        exitCode: 0,
        output: { kind: "confirmed", outcome: "text-proposal" },
    });
    assert.equal(closed, 3);
});
