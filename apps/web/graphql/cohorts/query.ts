import { GraphQLList, GraphQLNonNull, GraphQLString } from "graphql";
import GQLContext from "@models/GQLContext";
import types from "./types";
import userTypes from "../users/types";
import { getCohort, getCohortMembers, getCohorts } from "./logic";

const queries = {
    getCohort: {
        type: types.cohortType,
        args: {
            cohortId: { type: new GraphQLNonNull(GraphQLString) },
        },
        resolve: (
            _: any,
            { cohortId }: { cohortId: string },
            context: GQLContext,
        ) => getCohort(cohortId, context),
    },
    getCohorts: {
        type: new GraphQLList(types.cohortType),
        args: {
            courseId: { type: GraphQLString },
        },
        resolve: (
            _: any,
            { courseId }: { courseId?: string },
            context: GQLContext,
        ) => getCohorts(context, courseId),
    },
    getCohortMembers: {
        type: new GraphQLList(userTypes.userType),
        args: {
            cohortId: { type: new GraphQLNonNull(GraphQLString) },
        },
        resolve: (
            _: any,
            { cohortId }: { cohortId: string },
            context: GQLContext,
        ) => getCohortMembers(cohortId, context),
    },
};

export default queries;
