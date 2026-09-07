import UserModel from "@/models/User";
import { Constants } from "@courselit/common-models";
import { recordActivity } from "@/lib/record-activity";
import { triggerSequences } from "@/lib/trigger-sequences";

/** Change only an explicit newsletter choice. CAS prevents repeat subscription events. */
export async function setNewsletterConsent(
    domain: string,
    userId: string,
    subscribed: boolean,
) {
    const changed = await UserModel.findOneAndUpdate(
        { domain, userId, subscribedToUpdates: { $ne: subscribed } },
        { $set: { subscribedToUpdates: subscribed } },
        { new: true },
    );
    if (!changed) return;
    await recordActivity({
        domain: changed.domain,
        userId,
        entityId: userId,
        type: subscribed
            ? Constants.ActivityType.NEWSLETTER_SUBSCRIBED
            : Constants.ActivityType.NEWSLETTER_UNSUBSCRIBED,
    });
    if (subscribed)
        await triggerSequences({
            user: changed,
            event: Constants.EventType.SUBSCRIBER_ADDED,
        });
}
