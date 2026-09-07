import { createHash } from "node:crypto";
import {
    requireValue,
    object,
    leaseFields,
    modelInput,
    parseModelResult,
    escalation,
    confirmedReceipt,
} from "./protocol.mjs";

export async function runOnce({
    config,
    journal,
    site,
    model,
    now = () => Date.now(),
}) {
    const binding = createHash("sha256")
        .update(`${config.site}\n${config.grant}`)
        .digest("hex");
    let pending = await journal.read();
    if (pending) {
        requireValue(
            pending.binding === binding,
            "journal-credential-mismatch",
        );
        requireValue(pending.kind === "prepared", "inference-needs-review");
        object(pending, ["kind", "binding", "request"]);
        object(pending.request, [
            "feedbackId",
            "generation",
            "leaseId",
            "inputHash",
            "result",
        ]);
        leaseFields(pending.request);
        // Only this runner's supported result shapes can leave a durable journal.
        const result = pending.request.result;
        object(
            result,
            result?.kind === "escalation"
                ? ["kind", "reason", "summary"]
                : ["kind", "summary", "replacement"],
        );
        if (result.kind === "text-proposal")
            object(result.replacement, ["kind", "text"]);
        pending.request = {
            ...leaseFields(pending.request),
            result:
                result?.kind === "escalation"
                    ? escalation(result.reason, result.summary)
                    : parseModelResult({
                          kind: result?.kind,
                          summary: result?.summary,
                          text:
                              result?.replacement?.kind === "text"
                                  ? result.replacement.text
                                  : null,
                      }),
        };
    } else {
        const claimed = await site("claim", {});
        object(claimed, ["claim", "recovered"]);
        requireValue(Object.keys(claimed).length === 1, "invalid-claim");
        if (claimed?.recovered)
            return {
                kind: "recovered",
                receipt: confirmedReceipt(claimed.recovered, claimed.recovered),
            };
        if (claimed?.claim === null) return { kind: "idle" };
        const lease = leaseFields(claimed?.claim);
        requireValue(
            Date.parse(claimed.claim.leaseUntil) - now() > 60000,
            "lease-too-short",
        );
        const context = await site("context", lease);
        const input = modelInput(context, lease);
        let result;
        if (!input) {
            result = escalation(
                "human-review",
                "This comment needs the human authoring path because its target is private, unsupported, ambiguous or formatted text.",
            );
        } else {
            // A crash cannot silently spend again. An incomplete inference marker
            // requires operator review; a received valid result is retained below.
            await journal.write({
                kind: "inference-started",
                binding,
                lease,
                startedAt: new Date(now()).toISOString(),
            });
            try {
                result = parseModelResult(await model(input));
            } catch {
                result = escalation(
                    "human-review",
                    "Automatic review did not produce a complete, valid proposal. Please review the original comment; no site change was applied.",
                );
            }
        }
        pending = { kind: "prepared", binding, request: { ...lease, result } };
        await journal.write(pending);
    }
    const receipt = confirmedReceipt(
        await site("result", pending.request),
        pending.request,
    );
    await journal.complete({ at: new Date(now()).toISOString(), ...receipt });
    return { kind: "confirmed", receipt };
}
