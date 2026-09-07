import mongoose from "mongoose";
import type {
    PreferredContact,
    PersonalCheckIns,
} from "@courselit/common-models";

interface ContactPreferenceKey {
    domain: mongoose.Types.ObjectId;
    userId: string;
    revision: number;
    updatedAt: Date;
}
export type InternalContactPreferences = ContactPreferenceKey &
    (
        | {
              state: "active";
              contact: PreferredContact;
              checkIns: PersonalCheckIns;
              photoVersion?: number;
              photoJpeg?: Buffer;
          }
        | {
              state: "deleted";
              contact?: never;
              checkIns?: never;
              photoVersion?: never;
              photoJpeg?: never;
          }
    );

export const ContactPreferencesSchema =
    new mongoose.Schema<InternalContactPreferences>({
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        userId: { type: String, required: true },
        revision: { type: Number, required: true },
        state: {
            type: String,
            enum: ["active", "deleted"],
            default: "active",
            required: true,
        },
        contact: {
            type: mongoose.Schema.Types.Mixed,
            required: function (this: InternalContactPreferences) {
                return this.state === "active";
            },
        },
        checkIns: {
            type: String,
            enum: ["none", "occasional"],
            required: function (this: InternalContactPreferences) {
                return this.state === "active";
            },
        },
        photoVersion: Number,
        // Never included by a normal preference query or serialized DTO.
        photoJpeg: { type: Buffer, select: false },
        updatedAt: { type: Date, required: true },
    });
ContactPreferencesSchema.index({ domain: 1, userId: 1 }, { unique: true });
