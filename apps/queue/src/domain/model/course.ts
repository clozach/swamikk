import mongoose, { Model } from "mongoose";
import { CourseSchema, type InternalCourse } from "@courselit/orm-models";
export default (mongoose.models.Course as Model<InternalCourse>) ||
    mongoose.model<InternalCourse>("Course", CourseSchema);
