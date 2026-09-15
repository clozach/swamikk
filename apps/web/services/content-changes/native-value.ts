/** Copy JSON containers while preserving opaque native BSON/date/binary values.
 * Editors only mutate plain records and arrays; unrelated native metadata must
 * never be serialized to strings or ordinary objects on the way to MongoDB. */
export function copyNativeValue<T>(value: T): T {
    if (Array.isArray(value)) return value.map(copyNativeValue) as T;
    if (!value || typeof value !== "object") return value;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
            key,
            copyNativeValue(entry),
        ]),
    ) as T;
}
