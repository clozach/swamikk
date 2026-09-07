import NotificationModel from "../../model/notification";
import { addNotificationJob } from "../enqueue";
import { ChannelPayload, NotificationChannel } from "./types";
import { withNotificationAccounts } from "../account-gate";

export class AppChannel implements NotificationChannel {
    async send(payload: ChannelPayload): Promise<void> {
        await withNotificationAccounts(
            {
                domainId: String(payload.domain._id),
                actorId: payload.actorUserId,
                recipientId: payload.recipient.userId,
            },
            async () => {
                const notification = await NotificationModel.create({
                    domain: payload.domain._id,
                    userId: payload.actorUserId,
                    forUserId: payload.recipient.userId,
                    activityType: payload.activityType,
                    entityId: payload.entityId,
                    entityTargetId: payload.entityTargetId,
                    metadata: payload.metadata || {},
                });

                // Keep content out of new queued copies; delivery re-reads the live row.
                await addNotificationJob({
                    domain: String(notification.domain),
                    notificationId: notification.notificationId,
                });
            },
        );
    }
}
