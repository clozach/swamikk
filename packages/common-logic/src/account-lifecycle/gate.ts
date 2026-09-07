import { randomUUID } from "crypto";
import { AccountLifecycleModel, LifecycleUserModel } from "./model";

export interface AccountKey {
    domainId: string;
    userId: string;
}
export class AccountLifecycleError extends Error {
    readonly status = 409;
    constructor(
        readonly code: "account_unavailable" | "account_busy",
        message: string,
    ) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = "AccountLifecycleError";
    }
}
const key = ({ domainId, userId }: AccountKey) => ({
    domain: domainId,
    userId,
});
async function initialize(input: AccountKey, state: "active" | "closing") {
    await AccountLifecycleModel.init();
    try {
        await AccountLifecycleModel.updateOne(
            key(input),
            {
                $setOnInsert: {
                    ...key(input),
                    state,
                    writes: [],
                    updatedAt: new Date(),
                },
            },
            { upsert: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
    }
}

/** A reservation spans the entire write, including awaits. Crashed reservations do not expire. */
export async function withAccountWrite<T>(
    input: AccountKey & { purpose: string; allowInactive?: true },
    operation: () => Promise<T>,
): Promise<T> {
    const userFilter = {
        ...key(input),
        ...(input.allowInactive ? {} : { active: true }),
    };
    if (!(await LifecycleUserModel.exists(userFilter)))
        throw new AccountLifecycleError(
            "account_unavailable",
            "This account is unavailable.",
        );
    await initialize(input, "active");
    const id = randomUUID();
    const reserved = await AccountLifecycleModel.updateOne(
        { ...key(input), state: "active" },
        {
            $push: {
                writes: { id, purpose: input.purpose, startedAt: new Date() },
            },
            $set: { updatedAt: new Date() },
        },
    );
    if (reserved.modifiedCount !== 1)
        throw new AccountLifecycleError(
            "account_unavailable",
            "Account closure is in progress. No changes were saved.",
        );
    try {
        if (!(await LifecycleUserModel.exists(userFilter)))
            throw new AccountLifecycleError(
                "account_unavailable",
                "This account is unavailable.",
            );
        return await operation();
    } finally {
        await AccountLifecycleModel.updateOne(
            { ...key(input), "writes.id": id },
            { $pull: { writes: { id } }, $set: { updatedAt: new Date() } },
        );
    }
}

export async function beginAccountClosure(input: AccountKey) {
    await initialize(input, "closing");
    await AccountLifecycleModel.updateOne(
        { ...key(input), state: "active" },
        { $set: { state: "closing", updatedAt: new Date() } },
    );
    const record = await AccountLifecycleModel.findOne(key(input)).lean();
    if (!record)
        throw new AccountLifecycleError(
            "account_unavailable",
            "Account closure could not be recorded.",
        );
    return record.writes.length
        ? { kind: "pending" as const, writes: record.writes }
        : {
              kind:
                  record.state === "erased"
                      ? ("erased" as const)
                      : ("ready" as const),
          };
}

/** Cleanup callers share this fence even when invoked without the account API. */
export async function requireAccountErasureReady(input: AccountKey) {
    const result = await beginAccountClosure(input);
    if (result.kind === "pending")
        throw new AccountLifecycleError(
            "account_busy",
            "A change is still finishing. Account data has not been erased; check again before continuing.",
        );
}
export async function markAccountErasing(input: AccountKey) {
    await requireAccountErasureReady(input);
    await AccountLifecycleModel.updateOne(
        { ...key(input), state: "closing", writes: { $size: 0 } },
        { $set: { state: "erasing", updatedAt: new Date() } },
    );
    if (
        !(await AccountLifecycleModel.exists({
            ...key(input),
            state: { $in: ["erasing", "erased"] },
            writes: { $size: 0 },
        }))
    )
        throw new AccountLifecycleError(
            "account_busy",
            "Account closure changed. Review it again.",
        );
}
export async function reopenAccountBeforeErasure(input: AccountKey) {
    return AccountLifecycleModel.updateOne(
        { ...key(input), state: "closing" },
        { $set: { state: "active", updatedAt: new Date() } },
    );
}
export async function finishAccountClosure(input: AccountKey) {
    const finished = await AccountLifecycleModel.updateOne(
        {
            ...key(input),
            state: { $in: ["erasing", "erased"] },
            writes: { $size: 0 },
        },
        { $set: { state: "erased", updatedAt: new Date() } },
    );
    if (finished.matchedCount !== 1)
        throw new AccountLifecycleError(
            "account_busy",
            "Account erasure has not finished.",
        );
}
