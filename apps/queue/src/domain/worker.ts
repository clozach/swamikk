import { Worker } from "bullmq";
import { logger } from "../logger";
import { captureError, getDomainId } from "../observability/posthog";
import { sendMail } from "../mail";
import { registerWorkerEvents, workerOptions } from "../bullmq";
import {
    claimDelivery,
    finishDelivery,
} from "../../../../packages/common-logic/src/member-access/drip";
import { MailJob } from "./model/mail-job";

export async function processMailJob(job: { id?: string; data: any }) {
    const { to, from, subject, body, headers, domainId } = job.data;
    let claimId: string | undefined;
    const drip =
        job.data.drip === undefined
            ? undefined
            : MailJob.shape.drip.parse(job.data.drip);
    try {
        if (drip) {
            const claim = await claimDelivery(
                domainId,
                drip.periodId,
                drip.deliveryId,
            );
            if (claim.kind === "skipped") return;
            claimId = claim.claimId;
        }
        // Claim and cancellation contend on one ledger document. SMTP that has
        // crossed this boundary cannot be recalled if cancellation follows it.
        try {
            await sendMail({ from, to, subject, html: body, headers });
        } catch (error) {
            if (drip && claimId) {
                await finishDelivery(
                    domainId,
                    drip.periodId,
                    drip.deliveryId,
                    claimId,
                    "uncertain",
                );
            }
            throw error;
        }
        if (drip && claimId) {
            await finishDelivery(
                domainId,
                drip.periodId,
                drip.deliveryId,
                claimId,
                "sent",
            );
        }
    } catch (err: any) {
        logger.error(err);
        captureError({
            error: err,
            source: "worker.mail",
            domainId: getDomainId(domainId),
            context: {
                queue_name: "mail",
                job_id: String(job.id),
                error_code: err?.code,
                response_code: err?.responseCode,
                command: err?.command,
            },
        });
        throw err;
    }
}

export function startMailWorker() {
    const worker = new Worker("mail", processMailJob, workerOptions);

    registerWorkerEvents(worker, "mail");

    return worker;
}
