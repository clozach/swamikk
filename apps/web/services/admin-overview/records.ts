import { createHash } from "crypto";
import type { Model } from "mongoose";
import type { DiagnosticSource, SourceCoverage } from "./types";

export const RECORD_LIMIT = 500;
export const ATTENTION_LIMIT = 50;
export const ACCESS_CHECK_LIMIT = 25;
export const ATTENTION_AFTER_MS = 60_000;

export function date(value: unknown): Date | undefined {
    if (!(typeof value === "string" || value instanceof Date)) return;
    const result = new Date(value);
    return Number.isFinite(result.getTime()) ? result : undefined;
}
export function stamp(value: unknown) {
    return date(value)?.toISOString() || null;
}
export function diagnosticId(domain: string, source: string, id: string) {
    return createHash("sha256")
        .update(`${domain}:${source}:${id}`)
        .digest("hex")
        .slice(0, 16);
}
export type Scan<T> = { rows: T[]; coverage: SourceCoverage };

/** Each source fails independently. A failed read is never represented as a measured zero. */
export async function scan<T>(
    source: DiagnosticSource,
    model: Pick<Model<any>, "find">,
    filter: Record<string, unknown>,
    select: string,
): Promise<Scan<T>> {
    try {
        const found = await model
            .find(filter)
            .select(select)
            .sort({ updatedAt: -1, _id: -1 })
            .limit(RECORD_LIMIT + 1)
            .lean();
        const rows = found.slice(0, RECORD_LIMIT) as unknown as T[];
        const stamps = found.flatMap((row) => {
            const at = date(row.updatedAt) || date(row.createdAt);
            return at ? [at.getTime()] : [];
        });
        return {
            rows,
            coverage: {
                source,
                state: "available",
                loaded: rows.length,
                limited: found.length > RECORD_LIMIT,
                latestRecordAt: stamps.length
                    ? new Date(Math.max(...stamps)).toISOString()
                    : null,
            },
        };
    } catch {
        return {
            rows: [],
            coverage: {
                source,
                state: "unavailable",
                loaded: 0,
                limited: false,
                latestRecordAt: null,
            },
        };
    }
}
