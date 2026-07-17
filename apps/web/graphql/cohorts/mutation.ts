import {
    GraphQLFloat,
    GraphQLList,
    GraphQLNonNull,
    GraphQLString,
} from "graphql";
import GQLContext from "@models/GQLContext";
import types from "./types";
import mailTypes from "../mails/types";
import {
    addCohortMembers,
    createCohort,
    deleteCohort,
    messageCohort,
    removeCohortMembers,
    syncCohortFromCourse,
    updateCohort,
} from "./logic";

const mutations = {
    createCohort: {
        type: types.cohortType,
        args: {
            name: { type: new GraphQLNonNull(GraphQLString) },
            courseId: { type: new GraphQLNonNull(GraphQLString) },
            schedule: { type: types.cohortScheduleInput },
        },
        resolve: async (
            _: any,
            args: {
                name: string;
                courseId: string;
                schedule?: { startAt?: number; endAt?: number };
            },
            context: GQLContext,
        ) => createCohort(args, context),
    },
    updateCohort: {
        type: types.cohortType,
        args: {
            cohortId: { type: new GraphQLNonNull(GraphQLString) },
            name: { type: GraphQLString },
            schedule: { type: types.cohortScheduleInput },
        },
        resolve: async (
            _: any,
            args: {
                cohortId: string;
                name?: string;
                schedule?: { startAt?: number; endAt?: number } | null;
            },
            context: GQLContext,
        ) => updateCohort(args, context),
    },
    deleteCohort: {
        type: types.cohortType,
        args: {
            cohortId: { type: new GraphQLNonNull(GraphQLString) },
        },
        resolve: async (
            _: any,
            { cohortId }: { cohortId: string },
            context: GQLContext,
        ) => deleteCohort(cohortId, context),
    },
    addCohortMembers: {
        type: types.cohortType,
        args: {
            cohortId: { type: new GraphQLNonNull(GraphQLString) },
            userIds: {
                type: new GraphQLNonNull(new GraphQLList(GraphQLString)),
            },
        },
        resolve: async (
            _: any,
            args: { cohortId: string; userIds: string[] },
            context: GQLContext,
        ) => addCohortMembers(args, context),
    },
    removeCohortMembers: {
        type: types.cohortType,
        args: {
            cohortId: { type: new GraphQLNonNull(GraphQLString) },
            userIds: {
                type: new GraphQLNonNull(new GraphQLList(GraphQLString)),
            },
        },
        resolve: async (
            _: any,
            args: { cohortId: string; userIds: string[] },
            context: GQLContext,
        ) => removeCohortMembers(args, context),
    },
    syncCohortFromCourse: {
        type: types.cohortType,
        args: {
            cohortId: { type: new GraphQLNonNull(GraphQLString) },
        },
        resolve: async (
            _: any,
            { cohortId }: { cohortId: string },
            context: GQLContext,
        ) => syncCohortFromCourse(cohortId, context),
    },
    messageCohort: {
        type: mailTypes.sequence,
        args: {
            cohortId: { type: new GraphQLNonNull(GraphQLString) },
            subject: { type: new GraphQLNonNull(GraphQLString) },
            content: { type: GraphQLString },
            templateId: { type: GraphQLString },
            delayInMillis: { type: GraphQLFloat },
        },
        resolve: async (
            _: any,
            args: {
                cohortId: string;
                subject: string;
                content?: string;
                templateId?: string;
                delayInMillis?: number;
            },
            context: GQLContext,
        ) => messageCohort(args, context),
    },
};

export default mutations;
