import { Worker } from "bullmq";
import mongoose from "mongoose";
import NotificationModel from "../model/notification";
import { withNotificationAccounts } from "../services/account-gate";
import { AccountLifecycleError } from "../../../../../packages/common-logic/src/account-lifecycle/gate";
import { logger } from "../../logger";
import { notificationEmitter } from "../utils/emitter";
import { captureError, getDomainId } from "../../observability/posthog";
import { registerWorkerEvents, workerOptions } from "../../bullmq";

export function startNotificationWorker() {
    const worker = new Worker(
        "notification",
        async (job) => {
            const notification = job.data;
            try {
                await deliverInAppNotification(notification);
            } catch (err: any) {
                logger.error(err);
                captureError({
                    error: err,
                    source: "worker.notification",
                    domainId: getDomainId(notification?.domain),
                    context: {
                        queue_name: "notification",
                        job_id: String(job.id),
                    },
                });
                throw err;
            }
        },
        workerOptions,
    );

    registerWorkerEvents(worker, "notification");

    return worker;
}

async function deliverInAppNotification(queued: {
    domain?: unknown;
    notificationId?: unknown;
}) {
    const domainId = String(queued?.domain || "");
    const notificationId =
        typeof queued?.notificationId === "string" ? queued.notificationId : "";
    if (!mongoose.isValidObjectId(domainId) || !notificationId) return;
    const filter = { domain: domainId, notificationId };
    const notification = await NotificationModel.findOne(filter).lean();
    if (!notification) return;
    try {
        await withNotificationAccounts(
            {
                domainId,
                actorId: notification.userId,
                recipientId: notification.forUserId,
            },
            async () => {
                const current = await NotificationModel.findOne({
                    ...filter,
                    _id: notification._id,
                    userId: notification.userId,
                    forUserId: notification.forUserId,
                }).lean();
                if (current)
                    notificationEmitter.emit("newNotification", current);
            },
        );
    } catch (error) {
        // A vanished/closing account makes an old delivery ineligible, not retryable.
        if (error instanceof AccountLifecycleError) return;
        throw error;
    }
}
