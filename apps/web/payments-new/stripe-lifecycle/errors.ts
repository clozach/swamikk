export class StripeLifecycleError extends Error {
    constructor(
        public readonly reason: string,
        public readonly retryable = false,
    ) {
        super(reason);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export function requireStripeFact(
    value: unknown,
    reason: string,
): asserts value {
    if (!value) throw new StripeLifecycleError(reason);
}
export function providerId(value: unknown): string | undefined {
    return typeof value === "string"
        ? value
        : value &&
            typeof value === "object" &&
            "id" in value &&
            typeof value.id === "string"
          ? value.id
          : undefined;
}
