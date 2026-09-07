import { createHash } from "crypto";

export function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .filter((key) => value[key] !== undefined)
            .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

export function fingerprint(value: unknown): string {
    return createHash("sha256").update(stableJson(value)).digest("hex");
}
