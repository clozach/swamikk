export class ReviewError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function requireValue(condition, code = "invalid-response") {
    if (!condition) throw new ReviewError(code);
}

export function object(value, keys) {
    requireValue(value && typeof value === "object" && !Array.isArray(value));
    requireValue(Object.getPrototypeOf(value) === Object.prototype);
    requireValue(Object.keys(value).every((key) => keys.includes(key)));
    return value;
}

export function boundedString(value, limit) {
    requireValue(
        typeof value === "string" &&
            value.trim().length > 0 &&
            value.length <= limit,
    );
    return value;
}

export function leaseFields(value) {
    requireValue(value && typeof value === "object");
    for (const key of ["feedbackId", "leaseId"])
        requireValue(
            typeof value[key] === "string" && /^[\w-]{1,128}$/.test(value[key]),
        );
    requireValue(
        Number.isSafeInteger(value.generation) && value.generation > 0,
    );
    requireValue(
        typeof value.inputHash === "string" &&
            /^[a-f0-9]{64}$/.test(value.inputHash),
    );
    return Object.fromEntries(
        ["feedbackId", "generation", "leaseId", "inputHash"].map((key) => [
            key,
            value[key],
        ]),
    );
}

export const reasons = [
    "human-review",
    "private-or-access",
    "payment-or-policy",
    "structure-or-media",
    "ambiguous-target",
];

export function escalation(reason, summary) {
    requireValue(reasons.includes(reason));
    return {
        kind: "escalation",
        reason,
        summary: boundedString(summary, 2000),
    };
}

// The first unattended adapter handles plain text only. Rich documents retain
// formatting through the existing human authoring path, rather than flattening it.
export function modelInput(value, lease) {
    requireValue(
        value.feedbackId === lease.feedbackId &&
            value.generation === lease.generation &&
            value.leaseId === lease.leaseId &&
            value.inputHash === lease.inputHash,
        "context-mismatch",
    );
    requireValue(value.feedback?.trust === "untrusted-user-input");
    boundedString(value.feedback.text, 12000);
    if (value.context?.kind === "escalation-only") return null;
    requireValue(value.context?.kind === "text");
    if (value.context.valueKind !== "text") return null;
    requireValue(
        typeof value.context.value === "string" &&
            value.context.value.length <= 24000,
    );
    const input = {
        comment: value.feedback.text,
        currentText: value.context.value,
    };
    requireValue(
        Buffer.byteLength(JSON.stringify(input)) <= 40000,
        "context-too-large",
    );
    return input;
}

export function parseModelResult(value) {
    object(value, ["kind", "summary", "text", "reason"]);
    if (value.kind === "escalation") {
        object(value, ["kind", "summary", "reason"]);
        return escalation(value.reason, value.summary);
    }
    object(value, ["kind", "summary", "text"]);
    requireValue(value.kind === "text-proposal");
    const result = {
        kind: "text-proposal",
        summary: boundedString(value.summary, 2000),
        replacement: { kind: "text", text: boundedString(value.text, 20000) },
    };
    requireValue(
        Buffer.byteLength(JSON.stringify(result)) <= 60000,
        "result-too-large",
    );
    return result;
}

export function confirmedReceipt(value, lease) {
    requireValue(
        typeof value?.feedbackId === "string" &&
            /^[\w-]{1,128}$/.test(value.feedbackId),
        "unconfirmed-result",
    );
    requireValue(
        Number.isSafeInteger(value.generation) && value.generation > 0,
        "unconfirmed-result",
    );
    requireValue(
        value?.feedbackId === lease.feedbackId &&
            value.generation === lease.generation &&
            value.state === "done",
        "unconfirmed-result",
    );
    requireValue(
        ["text-proposal", "escalation"].includes(value.outcome),
        "unconfirmed-result",
    );
    if (lease.result)
        requireValue(value.outcome === lease.result.kind, "unconfirmed-result");
    if (value.outcome === "text-proposal" || value.proposalId !== undefined)
        requireValue(
            typeof value.proposalId === "string" &&
                /^[\w-]{1,180}$/.test(value.proposalId),
            "unconfirmed-result",
        );
    return {
        feedbackId: value.feedbackId,
        generation: value.generation,
        state: value.state,
        outcome: value.outcome,
        ...(value.proposalId ? { proposalId: value.proposalId } : {}),
    };
}
