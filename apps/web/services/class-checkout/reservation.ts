import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { ContentChangeError } from "@/services/content-changes/errors";

type State =
    | { kind: "idle" }
    | { kind: "held"; id: string; startedAt: Date; invoiceId?: string };
interface Reservation {
    domain: mongoose.Types.ObjectId;
    userId: string;
    courseId: string;
    state: State;
}
const schema = new mongoose.Schema<Reservation>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        userId: { type: String, required: true },
        courseId: { type: String, required: true },
        state: { type: mongoose.Schema.Types.Mixed, required: true },
    },
    { timestamps: true },
);
schema.index({ domain: 1, userId: 1, courseId: 1 }, { unique: true });
export const CheckoutReservation =
    (mongoose.models.CheckoutReservation as
        | mongoose.Model<Reservation>
        | undefined) ||
    mongoose.model<Reservation>("CheckoutReservation", schema);
const context = new AsyncLocalStorage<{
    domain: string;
    userId: string;
    courseId: string;
    id: string;
}>();
/** Shared by every course plan, so a subscription cannot replace an in-flight class session. No expiry can prove a stopped worker. */
export async function withCheckoutReservation<T>(
    domain: string,
    userId: string,
    courseId: string | null,
    operation: () => Promise<T>,
): Promise<T> {
    if (!courseId) return operation();
    await CheckoutReservation.init();
    const key = { domain, userId, courseId },
        id = randomUUID();
    try {
        await CheckoutReservation.findOneAndUpdate(
            { ...key, "state.kind": "idle" },
            { $set: { state: { kind: "held", id, startedAt: new Date() } } },
            { upsert: true, new: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const held = await CheckoutReservation.findOne(key).lean();
        const reference =
            held?.state.kind === "held"
                ? held.state.invoiceId || held.state.id
                : "unavailable";
        throw new ContentChangeError(
            "checkout_pending",
            `Another checkout is still being confirmed. Contact us with reference ${reference} before trying again.`,
            409,
        );
    }
    try {
        return await context.run({ ...key, id }, operation);
    } finally {
        await CheckoutReservation.updateOne(
            { ...key, "state.id": id },
            { $set: { state: { kind: "idle" } } },
        );
    }
}
export async function recordCheckoutReference(invoiceId: string) {
    const held = context.getStore();
    if (!held) return; // Non-course checkout keeps its existing path.
    const { id, ...key } = held;
    const saved = await CheckoutReservation.updateOne(
        { ...key, "state.id": id },
        { $set: { "state.invoiceId": invoiceId } },
    );
    if (saved.matchedCount !== 1)
        throw new ContentChangeError(
            "checkout_pending",
            `Checkout needs review. Contact us with order ${invoiceId}.`,
            409,
        );
}
