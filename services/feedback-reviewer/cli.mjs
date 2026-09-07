#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { loadConfiguration } from "./config.mjs";
import { privateJournal } from "./journal.mjs";
import { siteClient, modelClient } from "./transport.mjs";
import { runOnce } from "./run-once.mjs";
import { requireValue, ReviewError } from "./protocol.mjs";

export async function runCli(argv, dependencies = {}) {
    if (
        argv.length !== 3 ||
        argv[0] !== "run-once" ||
        argv[1] !== "--config" ||
        !argv[2]
    ) {
        return {
            exitCode: 2,
            output: {
                kind: "unconfigured",
                instruction:
                    "Use run-once --config with an explicitly prepared private JSON configuration.",
            },
        };
    }
    let journal;
    try {
        const config = await (
            dependencies.loadConfiguration || loadConfiguration
        )(argv[2]);
        journal = await (dependencies.privateJournal || privateJournal)(
            config.journalDirectory,
        );
        const options = { timeout: config.requestTimeoutMs };
        const result = await (dependencies.runOnce || runOnce)({
            config,
            journal,
            site: (dependencies.siteClient || siteClient)(config, options),
            model: (dependencies.modelClient || modelClient)(config, options),
        });
        requireValue(
            ["idle", "recovered", "confirmed"].includes(result?.kind),
            "runner-result-invalid",
        );
        return {
            exitCode: 0,
            output: {
                kind: result.kind,
                ...(result.receipt ? { outcome: result.receipt.outcome } : {}),
            },
        };
    } catch (error) {
        const code =
            error instanceof ReviewError && /^[a-z0-9-]+$/.test(error.code)
                ? error.code
                : "runner-unconfirmed";
        return {
            exitCode: 1,
            output: {
                kind: "stopped",
                code,
                instruction:
                    "Keep the private journal. Review the operator recovery instructions before retrying.",
            },
        };
    } finally {
        if (journal) await journal.close();
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    runCli(process.argv.slice(2))
        .then(({ exitCode, output }) => {
            process.stdout.write(JSON.stringify(output) + "\n");
            process.exitCode = exitCode;
        })
        .catch(() => {
            process.stderr.write(
                "Reviewer stopped with an unconfirmed local journal state. Preserve its files and inspect the documented recovery steps.\n",
            );
            process.exitCode = 1;
        });
}
