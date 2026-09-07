import type { AttentionItem, DiagnosticSource } from "./types";
import { diagnosticId, stamp } from "./records";

export type PendingAttention = AttentionItem & { subject?: string };
export function attentionRecord(
    domain: string,
    source: DiagnosticSource,
    id: string,
    kind: AttentionItem["kind"],
    state: string,
    updatedAt: unknown,
    href: string,
    subject?: string,
    mode?: AttentionItem["mode"],
): PendingAttention {
    return {
        diagnosticId: diagnosticId(domain, source, id),
        source,
        kind,
        state,
        recordedAt: stamp(updatedAt),
        href,
        subject,
        mode,
    };
}
