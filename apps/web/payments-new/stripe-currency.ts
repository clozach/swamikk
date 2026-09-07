// Stripe's charge units differ from ISO display units for ISK and UGX.
// https://docs.stripe.com/currencies#zero-decimal (reviewed 2026-09-06)
const zeroDecimalChargeCurrencies = new Set([
    "bif",
    "clp",
    "djf",
    "gnf",
    "jpy",
    "kmf",
    "krw",
    "mga",
    "pyg",
    "rwf",
    "vnd",
    "vuv",
    "xaf",
    "xof",
    "xpf",
]);

export function stripeCurrencyFactor(currency: string): number {
    if (!/^[a-z]{3}$/i.test(currency))
        throw new Error("Invalid payment currency");
    return zeroDecimalChargeCurrencies.has(currency.toLowerCase()) ? 1 : 100;
}

export function toStripeAmount(amount: number, currency: string): number {
    const minor = Math.round(amount * stripeCurrencyFactor(currency));
    if (!Number.isSafeInteger(minor) || minor < 0)
        throw new Error("Invalid payment amount");
    if (["isk", "ugx"].includes(currency.toLowerCase()) && minor % 100 !== 0) {
        throw new Error("This currency requires a whole-number price");
    }
    return minor;
}

export function fromStripeAmount(amount: number, currency: string): number {
    if (!Number.isSafeInteger(amount) || amount < 0)
        throw new Error("Invalid settled payment amount");
    return amount / stripeCurrencyFactor(currency);
}
