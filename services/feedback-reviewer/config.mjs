import path from "node:path";
import { requireValue, ReviewError } from "./protocol.mjs";
import { inside, privatePath, readPrivate } from "./private-inputs.mjs";

export const limits = Object.freeze({
    maxCompletionTokens: 4096,
    minimumTimeoutMs: 1000,
    maximumTimeoutMs: 45000,
});
const fields = [
    "site",
    "modelUrl",
    "model",
    "maxCompletionTokens",
    "requestTimeoutMs",
    "grantFile",
    "apiKeyFile",
    "journalDirectory",
    "allowLocalTestHttp",
];
function strictObject(text) {
    let value;
    try {
        value = JSON.parse(text);
    } catch {
        throw new ReviewError("config-invalid-json");
    }
    requireValue(
        value && Object.getPrototypeOf(value) === Object.prototype,
        "config-object-required",
    );
    requireValue(
        Object.keys(value).every((key) => fields.includes(key)),
        "config-unknown-field",
    );
    // Configuration is one flat object. Tokenize complete strings so escaped
    // duplicate keys cannot silently select a different destination or key file.
    const tokens =
        text.match(
            /"(?:\\.|[^"\\])*"|[{}:,\[\]]|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
        ) || [];
    const seen = new Set();
    let index = 1;
    while (tokens[index] !== "}") {
        requireValue(
            tokens[index]?.startsWith('"'),
            "config-flat-object-required",
        );
        const key = JSON.parse(tokens[index++]);
        requireValue(!seen.has(key), "config-duplicate-field");
        seen.add(key);
        requireValue(tokens[index++] === ":", "config-invalid-json");
        requireValue(
            !["{", "[", "}", "]", ":", ","].includes(tokens[index++]),
            "config-flat-object-required",
        );
        if (tokens[index] !== ",") break;
        index++;
    }
    requireValue(
        tokens[index] === "}" && index === tokens.length - 1,
        "config-flat-object-required",
    );
    return value;
}

function endpoint(value, allowHttp, originOnly) {
    requireValue(
        typeof value === "string" &&
            value.length <= 2048 &&
            !/[\s\\\u0000-\u001f\u007f]/.test(value),
        "config-invalid-url",
    );
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new ReviewError("config-invalid-url");
    }
    requireValue(
        !url.username && !url.password && !/[?#]/.test(value),
        "config-url-credentials-or-query",
    );
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    requireValue(
        url.protocol === "https:" ||
            (allowHttp && url.protocol === "http:" && loopback),
        "config-https-required",
    );
    if (originOnly) {
        requireValue(
            value === url.origin || value === `${url.origin}/`,
            "config-site-origin-required",
        );
        return url.origin;
    }
    requireValue(
        value === url.href && url.pathname !== "/",
        "config-exact-model-endpoint-required",
    );
    return value;
}

export function parseConfiguration(text) {
    const value = strictObject(text);
    requireValue(
        fields.slice(0, -1).every((key) => Object.hasOwn(value, key)),
        "config-required-field-missing",
    );
    requireValue(
        value.allowLocalTestHttp === undefined ||
            typeof value.allowLocalTestHttp === "boolean",
        "config-local-test-flag",
    );
    requireValue(
        typeof value.model === "string" &&
            /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value.model),
        "config-model-required",
    );
    requireValue(
        Number.isSafeInteger(value.maxCompletionTokens) &&
            value.maxCompletionTokens > 0 &&
            value.maxCompletionTokens <= limits.maxCompletionTokens,
        "config-completion-limit",
    );
    requireValue(
        Number.isSafeInteger(value.requestTimeoutMs) &&
            value.requestTimeoutMs >= limits.minimumTimeoutMs &&
            value.requestTimeoutMs <= limits.maximumTimeoutMs,
        "config-timeout-limit",
    );
    for (const field of ["grantFile", "apiKeyFile", "journalDirectory"]) {
        requireValue(
            typeof value[field] === "string" &&
                value[field].length <= 4096 &&
                path.isAbsolute(value[field]) &&
                !/[\u0000-\u001f\u007f]/.test(value[field]),
            "config-absolute-private-path-required",
        );
    }
    return {
        ...value,
        site: endpoint(value.site, value.allowLocalTestHttp === true, true),
        modelUrl: endpoint(
            value.modelUrl,
            value.allowLocalTestHttp === true,
            false,
        ),
    };
}

export async function loadConfiguration(configFile) {
    try {
        const configPath = await privatePath(configFile);
        const parsed = parseConfiguration(await readPrivate(configPath, 16384));
        const grantFile = await privatePath(parsed.grantFile);
        const apiKeyFile = await privatePath(parsed.apiKeyFile);
        const journalDirectory = await privatePath(
            parsed.journalDirectory,
            true,
        );
        requireValue(
            new Set([configPath, grantFile, apiKeyFile]).size === 3,
            "private-input-paths-must-differ",
        );
        requireValue(
            [configPath, grantFile, apiKeyFile].every(
                (file) => !inside(file, journalDirectory),
            ),
            "private-input-in-journal",
        );
        const grant = (await readPrivate(grantFile, 8192)).replace(
            /\r?\n$/,
            "",
        );
        const modelKey = (await readPrivate(apiKeyFile, 8192)).replace(
            /\r?\n$/,
            "",
        );
        requireValue(
            [grant, modelKey].every((token) => /^[!-~]{16,4096}$/.test(token)),
            "private-token-format",
        );
        return {
            site: parsed.site,
            modelUrl: parsed.modelUrl,
            model: parsed.model,
            maxTokens: parsed.maxCompletionTokens,
            requestTimeoutMs: parsed.requestTimeoutMs,
            journalDirectory,
            grant,
            modelKey,
        };
    } catch (error) {
        if (error instanceof ReviewError) throw error;
        throw new ReviewError("configuration-unreadable");
    }
}
