import { GraphQLInt, GraphQLList, GraphQLString } from "graphql";
import types from "./types";
import { getMedias } from "./logic";
import GQLContext from "@models/GQLContext";

const queries = {
    getMedias: {
        type: new GraphQLList(types.mediaWithUsageType),
        args: {
            page: { type: GraphQLInt },
            limit: { type: GraphQLInt },
            access: { type: GraphQLString },
        },
        resolve: (
            _: any,
            {
                page,
                limit,
                access,
            }: { page?: number; limit?: number; access?: "public" | "private" },
            context: GQLContext,
        ) => getMedias(context, { page, limit, access }),
    },
};

export default queries;
