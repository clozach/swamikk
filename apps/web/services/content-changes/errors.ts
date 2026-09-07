export class ContentChangeError extends Error {
    constructor(
        public code: string,
        message: string,
        public status: number = 400,
    ) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = "ContentChangeError";
    }
}

export function requireCondition(
    condition: unknown,
    code: string,
    message: string,
    status = 400,
): asserts condition {
    if (!condition) throw new ContentChangeError(code, message, status);
}
