import mongoose from "mongoose";
import { AccountLifecycleError, withAccountWrite } from "./gate";
import { LifecycleUserModel } from "./model";

export interface AccountMailIdentity {
    domainId: string;
    userId: string;
    actorUserId?: string;
}

/** Stable IDs bind one recipient. Never resolve or reassign an account by email. */
export async function withAccountMail<T>(
    identity: AccountMailIdentity,
    to: string[],
    operation: () => Promise<T>,
): Promise<T> {
    const validId = (id: unknown) =>
        typeof id === "string" && id.length > 0 && id.length <= 128;
    if (
        !mongoose.isValidObjectId(identity.domainId) ||
        !validId(identity.userId) ||
        (identity.actorUserId !== undefined &&
            !validId(identity.actorUserId)) ||
        to.length !== 1
    )
        throw new AccountLifecycleError(
            "account_unavailable",
            "The mail account identity is unavailable.",
        );
    const run = async () => {
        if (
            !(await LifecycleUserModel.exists({
                domain: identity.domainId,
                userId: identity.userId,
                active: true,
                email: to[0],
            }))
        )
            throw new AccountLifecycleError(
                "account_unavailable",
                "The mail recipient is unavailable.",
            );
        return operation();
    };
    return withAccountWrite(
        {
            domainId: identity.domainId,
            userId: identity.userId,
            purpose: "mail-recipient",
        },
        () =>
            identity.actorUserId && identity.actorUserId !== identity.userId
                ? withAccountWrite(
                      {
                          domainId: identity.domainId,
                          userId: identity.actorUserId,
                          purpose: "mail-actor",
                      },
                      run,
                  )
                : run(),
    );
}
