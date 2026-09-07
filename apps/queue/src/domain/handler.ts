import type { MailJob } from "./model/mail-job";
import mailQueue from "./queue";

export async function addMailJob({
    to,
    subject,
    body,
    from,
    domainId,
    headers,
    drip,
}: MailJob) {
    if (drip && to.length !== 1) {
        throw new Error("A drip delivery must have exactly one recipient.");
    }
    for (const recipient of to) {
        const payload = {
            to: recipient,
            subject,
            body,
            from,
            domainId,
            headers,
            ...(drip ? { drip } : {}),
        };
        if (drip) {
            await mailQueue.add("mail", payload, {
                jobId: `drip-${drip.periodId}-${drip.deliveryId}`,
                // The ledger is the deduplication authority. Pending intents must
                // remain recoverable after a completed/skipped or failed queue job.
                removeOnComplete: true,
                removeOnFail: true,
            });
        } else {
            await mailQueue.add("mail", payload);
        }
    }
}
