import type { MailJob } from "./model/mail-job";
import mailQueue from "./queue";
import { withMailAccounts } from "./account-mail";

export async function addMailJob({
    to,
    subject,
    body,
    from,
    domainId,
    headers,
    drip,
    account,
}: MailJob) {
    if (drip && to.length !== 1) {
        throw new Error("A drip delivery must have exactly one recipient.");
    }
    return withMailAccounts({ domainId, to, drip, account }, async () => {
        for (const recipient of to) {
            const payload = {
                to: recipient,
                subject,
                body,
                from,
                domainId,
                headers,
                ...(drip ? { drip } : {}),
                ...(account ? { account } : {}),
            };
            if (drip) {
                await mailQueue.add("mail", payload, {
                    jobId: `drip-${drip.periodId}-${drip.deliveryId}`,
                    // The ledger is the deduplication authority. Pending intents must
                    // remain recoverable after a completed/skipped or failed queue job.
                    removeOnComplete: true,
                    removeOnFail: true,
                });
            } else if (account) {
                await mailQueue.add("mail", payload, {
                    removeOnComplete: true,
                    removeOnFail: true,
                });
            } else {
                await mailQueue.add("mail", payload);
            }
        }
    });
}
