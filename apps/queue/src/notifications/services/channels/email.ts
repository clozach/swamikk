import { getNotificationMessageAndHref } from "@courselit/common-logic";
import { renderEmailToHtml } from "@courselit/email-editor";
import { getEmailFrom } from "@courselit/utils";
import { addMailJob } from "../../../domain/handler";
import { getSiteUrl } from "../../../utils/get-site-url";
import { ChannelPayload, NotificationChannel } from "./types";
import { getDomainId } from "../../../observability/posthog";
import { buildNotificationEmailTemplate } from "./notification-email-template";

function getActorAvatarUrl(actor: ChannelPayload["actor"]) {
    return actor?.avatar?.file || actor?.avatar?.thumbnail || undefined;
}

export class EmailChannel implements NotificationChannel {
    async send(payload: ChannelPayload): Promise<void> {
        if (!payload.recipient.email || payload.recipient.active !== true) {
            return;
        }

        const actorName =
            payload.actor?.name ||
            payload.actor?.email ||
            payload.actor?.userId ||
            "Someone";
        const notificationDetails = await getNotificationMessageAndHref({
            activityType: payload.activityType,
            entityId: payload.entityId,
            actorName,
            recipientUserId: payload.recipient.userId,
            recipientPermissions: payload.recipient.permissions || [],
            entityTargetId: payload.entityTargetId,
            metadata: payload.metadata,
            hrefPrefix: getSiteUrl(payload.domain),
            domainId: payload.domain?._id,
        });

        if (!notificationDetails.message || !notificationDetails.href) {
            return;
        }

        const preferencesUrl = `${getSiteUrl(payload.domain)}/dashboard/notifications`;
        const body = await renderEmailToHtml({
            email: buildNotificationEmailTemplate({
                actorName,
                actorAvatarUrl: getActorAvatarUrl(payload.actor),
                message: notificationDetails.message,
                notificationUrl: notificationDetails.href,
                preferencesUrl,
                hideCourseLitBranding:
                    payload.domain.settings?.hideCourseLitBranding,
            }),
        });

        await addMailJob({
            to: [payload.recipient.email],
            from: getEmailFrom({
                name: payload.domain.settings?.title || payload.domain.name,
                email: process.env.EMAIL_FROM || "",
            }),
            domainId: getDomainId(payload.domain?._id),
            account: {
                userId: payload.recipient.userId,
                actorUserId: payload.actorUserId,
            },
            subject: notificationDetails.message,
            body,
        });
    }
}
