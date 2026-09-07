import Event from "@/models/EmailEvent";
import {
    AccountLifecycleError,
    withAccountWrite,
} from "../../../../packages/common-logic/src/account-lifecycle/gate";

/** Old email links keep working after closure, without creating new personal tracking. */
export async function recordAccountEmailEvent(event: {
    domain: unknown;
    userId: string;
    sequenceId: string;
    emailId: string;
    action: string;
    link?: string;
    linkIndex?: number;
}) {
    try {
        await withAccountWrite(
            {
                domainId: String(event.domain),
                userId: event.userId,
                purpose: "email-tracking",
            },
            async () => {
                await Event.create(event);
            },
        );
    } catch (error) {
        if (!(error instanceof AccountLifecycleError)) throw error;
    }
}
