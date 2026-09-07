/** Native legacy input uses configured units (days by default); storage uses ms. */
export function relativeDripDelayInMillis(
    input: number,
    unitInMillis: number,
): number {
    const milliseconds = input * unitInMillis;
    if (
        !Number.isFinite(input) ||
        input < 0 ||
        !Number.isFinite(unitInMillis) ||
        unitInMillis <= 0 ||
        !Number.isSafeInteger(milliseconds) ||
        milliseconds > 10 * 365 * 86_400_000
    ) {
        throw new Error(
            "Relative drip delay must use days (the configured input unit), with a duration from zero to ten years and whole-millisecond precision.",
        );
    }
    return milliseconds;
}
