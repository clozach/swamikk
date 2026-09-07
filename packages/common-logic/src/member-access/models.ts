import mongoose from "mongoose";
import {
    CourseSchema,
    LessonSchema,
    MembershipSchema,
    UserSchema,
    type InternalCourse,
    type InternalLesson,
    type InternalMembership,
    type InternalUser,
} from "@courselit/orm-models";
import {
    MembershipAccessSchema,
    type InternalMembershipAccess,
} from "../../../orm-models/src/models/member-access";

export const MembershipAccessModel =
    (mongoose.models
        .MembershipAccess as mongoose.Model<InternalMembershipAccess>) ||
    mongoose.model<InternalMembershipAccess>(
        "MembershipAccess",
        MembershipAccessSchema,
    );
export const AccessMembershipModel =
    (mongoose.models.Membership as mongoose.Model<InternalMembership>) ||
    mongoose.model<InternalMembership>("Membership", MembershipSchema);
export const AccessCourseModel =
    (mongoose.models.Course as mongoose.Model<InternalCourse>) ||
    mongoose.model<InternalCourse>("Course", CourseSchema);
export const AccessLessonModel =
    (mongoose.models.Lesson as mongoose.Model<InternalLesson>) ||
    mongoose.model<InternalLesson>("Lesson", LessonSchema);
export const AccessUserModel =
    (mongoose.models.User as mongoose.Model<InternalUser>) ||
    mongoose.model<InternalUser>("User", UserSchema);
