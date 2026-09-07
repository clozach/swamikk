import mongoose from "mongoose";
import {
    ContactPreferencesSchema,
    type InternalContactPreferences,
} from "@courselit/orm-models";

export const ContactPreferencesModel: mongoose.Model<InternalContactPreferences> =
    (mongoose.models
        .ContactPreferences as mongoose.Model<InternalContactPreferences>) ||
    mongoose.model<InternalContactPreferences>(
        "ContactPreferences",
        ContactPreferencesSchema,
    );
