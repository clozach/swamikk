import { randomUUID } from "crypto";
import type { MembershipAccessKey } from "../../../common-models/src/member-access";
import { PurchaseAccessModel } from "./model";
import { accessAssert } from "../member-access/errors";

export const purchaseAccessKey = ({
    domainId,
    ...key
}: MembershipAccessKey) => ({ domain: domainId, ...key });
export async function initializePurchaseAccess(key: MembershipAccessKey) {
    await PurchaseAccessModel.init();
    try {
        await PurchaseAccessModel.updateOne(
            purchaseAccessKey(key),
            {
                $setOnInsert: {
                    ...purchaseAccessKey(key),
                    state: "open",
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

/** Shares one atomic boundary with full-refund announcement across all callback awaits. */
export async function withPurchaseAccessWrite<T>(
    key: MembershipAccessKey,
    operation: () => Promise<T>,
): Promise<T> {
    await initializePurchaseAccess(key);
    const id = randomUUID();
    const admitted = await PurchaseAccessModel.updateOne(
        { ...purchaseAccessKey(key), state: "open" },
        {
            $push: { writes: { id, startedAt: new Date() } },
            $set: { updatedAt: new Date() },
        },
    );
    accessAssert(
        admitted.modifiedCount === 1,
        "conflict",
        "This purchase has been fully refunded. Its access cannot be activated again.",
    );
    try {
        return await operation();
    } finally {
        await PurchaseAccessModel.updateOne(
            { ...purchaseAccessKey(key), "writes.id": id },
            { $pull: { writes: { id } }, $set: { updatedAt: new Date() } },
        );
    }
}

export async function purchaseAccessEnded(key: MembershipAccessKey) {
    return !!(await PurchaseAccessModel.exists({
        ...purchaseAccessKey(key),
        state: { $ne: "open" },
    }));
}

/** Serializes all native money observations with external access proof reads.
 * A stopped observer needs the same explicit worker-stop recovery as a writer. */
export async function withPurchaseAccessObservation<T>(
    key: MembershipAccessKey,
    operation: () => Promise<T>,
): Promise<T> {
    await initializePurchaseAccess(key);
    const id = randomUUID();
    const claim = await PurchaseAccessModel.updateOne(
        { ...purchaseAccessKey(key), observation: { $exists: false } },
        {
            $set: {
                observation: { id, startedAt: new Date() },
                updatedAt: new Date(),
            },
        },
    );
    accessAssert(
        claim.modifiedCount === 1,
        "unavailable",
        "This refund’s access evidence is being checked. Reconcile the existing request again.",
    );
    try {
        return await operation();
    } finally {
        await PurchaseAccessModel.updateOne(
            { ...purchaseAccessKey(key), "observation.id": id },
            { $unset: { observation: 1 }, $set: { updatedAt: new Date() } },
        );
    }
}
