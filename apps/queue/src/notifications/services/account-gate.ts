import {
    AccountLifecycleError,
    withAccountWrite,
} from "../../../../../packages/common-logic/src/account-lifecycle/gate";

/** A notification is personal to both its actor and its recipient. */
export function withNotificationAccounts<T>(
    input: { domainId: string; actorId: string; recipientId: string },
    operation: () => Promise<T>,
): Promise<T> {
    if (
        typeof input.actorId !== "string" ||
        !input.actorId ||
        typeof input.recipientId !== "string" ||
        !input.recipientId
    )
        throw new AccountLifecycleError(
            "account_unavailable",
            "The notification accounts are unavailable.",
        );
    return withAccountWrite(
        {
            domainId: input.domainId,
            userId: input.recipientId,
            purpose: "notification-recipient",
        },
        () =>
            input.actorId === input.recipientId
                ? operation()
                : withAccountWrite(
                      {
                          domainId: input.domainId,
                          userId: input.actorId,
                          purpose: "notification-actor",
                      },
                      operation,
                  ),
    );
}
