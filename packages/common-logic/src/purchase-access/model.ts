import mongoose from "mongoose";
import {
    PurchaseAccessSchema,
    type InternalPurchaseAccess,
} from "../../../orm-models/src/models/purchase-access";
export const PurchaseAccessModel =
    (mongoose.models
        .PurchaseAccess as mongoose.Model<InternalPurchaseAccess>) ||
    mongoose.model<InternalPurchaseAccess>(
        "PurchaseAccess",
        PurchaseAccessSchema,
    );
