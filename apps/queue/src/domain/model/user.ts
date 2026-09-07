import mongoose, { Model } from "mongoose";
import { UserSchema, type InternalUser } from "@courselit/orm-models";
const UserModel =
    (mongoose.models.User as Model<InternalUser>) ||
    mongoose.model<InternalUser>("User", UserSchema);
export default UserModel;
