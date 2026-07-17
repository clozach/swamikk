import types from "./types";
import { listCoupons, listPromotionCodes } from "./logic";
import { GraphQLList, GraphQLString } from "graphql";
import GQLContext from "@models/GQLContext";

const queries = {
    getCoupons: {
        type: new GraphQLList(types.couponType),
        args: {},
        resolve: (_: any, {}: any, context: GQLContext) => listCoupons(context),
    },
    getPromotionCodes: {
        type: new GraphQLList(types.promotionCodeType),
        args: {
            couponId: { type: GraphQLString },
        },
        resolve: (
            _: any,
            { couponId }: { couponId?: string },
            context: GQLContext,
        ) => listPromotionCodes(couponId, context),
    },
};

export default queries;
