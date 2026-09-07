import mongoose from "mongoose";
import { UserSchema, type InternalUser } from "@courselit/orm-models";

export interface AccountWriteReservation {
    id: string;
    purpose: string;
    startedAt: Date;
}
export interface InternalAccountLifecycle {
    domain: mongoose.Types.ObjectId;
    userId: string;
    state: "active" | "closing" | "erasing" | "erased";
    writes: AccountWriteReservation[];
    updatedAt: Date;
}
const schema = new mongoose.Schema<InternalAccountLifecycle>({
    domain: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: String, required: true },
    state: {
        type: String,
        enum: ["active", "closing", "erasing", "erased"],
        required: true,
    },
    writes: { type: mongoose.Schema.Types.Mixed, required: true, default: [] },
    updatedAt: { type: Date, required: true },
});
schema.index({ domain: 1, userId: 1 }, { unique: true });
export const AccountLifecycleModel =
    (mongoose.models
        .AccountLifecycle as mongoose.Model<InternalAccountLifecycle>) ||
    mongoose.model<InternalAccountLifecycle>("AccountLifecycle", schema);
export const LifecycleUserModel =
    (mongoose.models.User as mongoose.Model<InternalUser>) ||
    mongoose.model<InternalUser>("User", UserSchema);
