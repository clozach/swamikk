import { createHash } from "crypto";
import { FeedbackRateLimitModel } from "./models";
import { requireCondition } from "./errors";

export async function consumeRateLimit(
    subject: string,
    limit: number,
    windowMs: number,
) {
    await FeedbackRateLimitModel.init();
    const bucket = Math.floor(Date.now() / windowMs);
    const key = createHash("sha256")
        .update(`${subject}:${bucket}`)
        .digest("hex");
    // Upsert only initializes a counter. Increment is separate and guarded, never count-then-insert.
    try {
        await FeedbackRateLimitModel.updateOne(
            { key },
            {
                $setOnInsert: {
                    key,
                    count: 0,
                    expiresAt: new Date((bucket + 2) * windowMs),
                },
            },
            { upsert: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
    }
    const result = await FeedbackRateLimitModel.updateOne(
        { key, count: { $lt: limit } },
        { $inc: { count: 1 } },
    );
    requireCondition(
        result.modifiedCount === 1,
        "rate_limited",
        "Please wait a minute before trying again.",
        429,
    );
}
