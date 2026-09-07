import { StripeLifecycleError } from "./errors";

const MAX_WEBHOOK_BYTES = 1024 * 1024;
/** Decode without modifying JSON whitespace; signatures cover the original UTF-8 bytes. */
export async function readWebhookBody(request: Request): Promise<string> {
    const declared = Number(request.headers.get("content-length"));
    if (declared > MAX_WEBHOOK_BYTES)
        throw new StripeLifecycleError("webhook-too-large");
    if (!request.body) {
        const text = await request.text();
        if (Buffer.byteLength(text) > MAX_WEBHOOK_BYTES)
            throw new StripeLifecycleError("webhook-too-large");
        return text;
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > MAX_WEBHOOK_BYTES) {
                await reader.cancel();
                throw new StripeLifecycleError("webhook-too-large");
            }
            chunks.push(next.value);
        }
    } finally {
        reader.releaseLock();
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks),
    );
}
