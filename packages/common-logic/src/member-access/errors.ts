export class MemberAccessError extends Error {
    constructor(
        public code: "not_found" | "conflict" | "invalid" | "unavailable",
        message: string,
    ) {
        super(message);
        this.name = "MemberAccessError";
    }
}
export function accessAssert(
    value: unknown,
    code: MemberAccessError["code"],
    message: string,
): asserts value {
    if (!value) throw new MemberAccessError(code, message);
}
