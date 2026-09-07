import type GQLContext from "@/models/GQLContext";
import type { InternalUser } from "@courselit/orm-models";
import User from "@/models/User";
import { requireCondition } from "@/services/content-changes/errors";
import { requireClosureFinanciallyReady } from "./review";
import {
    beginAccountClosure,
    markAccountErasing,
    finishAccountClosure,
    reopenAccountBeforeErasure,
    AccountLifecycleError,
} from "../../../../packages/common-logic/src/account-lifecycle/gate";

export async function eraseAccount(
    user: InternalUser,
    successor: InternalUser,
    ctx: GQLContext,
    reviewHash?: string,
) {
    requireCondition(
        !ctx.memberMimic,
        "mimic_read_only",
        "Exit Member Mimic before closing an account.",
        403,
    );
    const helpers = await import("@/graphql/users/helpers");
    await helpers.validateUserDeletion(user, ctx);
    const review = await requireClosureFinanciallyReady(user, ctx);
    requireCondition(
        !reviewHash || reviewHash === review.reviewHash,
        "conflict",
        "Your account or payment status changed. Review the consequences again.",
        409,
    );
    const key = { domainId: String(ctx.subdomain._id), userId: user.userId };
    const closing = await beginAccountClosure(key);
    if (closing.kind === "pending")
        throw new AccountLifecycleError(
            "account_busy",
            "A change is still finishing. Account data has not been erased. Check closure again shortly; contact support if it stays pending.",
        );
    if (closing.kind === "erased") return { kind: "closed" as const };
    try {
        await requireClosureFinanciallyReady(user, ctx);
    } catch (error) {
        await reopenAccountBeforeErasure(key);
        throw error;
    }
    await markAccountErasing(key);
    await User.updateOne(
        { domain: ctx.subdomain._id, userId: user.userId },
        { $set: { active: false, subscribedToUpdates: false } },
    );
    await helpers.migrateBusinessEntities(user, successor, ctx);
    await helpers.cleanupPersonalData(user, ctx);
    await finishAccountClosure(key);
    return { kind: "closed" as const };
}
