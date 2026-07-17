import { GraphQLBoolean, GraphQLNonNull, GraphQLString } from "graphql";
import types from "./types";
import {
    createCoupon,
    deleteCoupon,
    createPromotionCode,
    deactivatePromotionCode,
    createFirstMonthFreeOffer,
} from "./logic";

const mutations = {
    createCoupon: {
        type: types.couponType,
        args: {
            input: {
                type: new GraphQLNonNull(types.couponCreateInput),
            },
        },
        resolve: async (
            _: any,
            { input }: { input: Record<string, unknown> },
            context: any,
        ) => createCoupon(input as any, context),
    },
    deleteCoupon: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
            couponId: { type: new GraphQLNonNull(GraphQLString) },
        },
        resolve: async (
            _: any,
            { couponId }: { couponId: string },
            context: any,
        ) => deleteCoupon(couponId, context),
    },
    createPromotionCode: {
        type: types.promotionCodeType,
        args: {
            input: {
                type: new GraphQLNonNull(types.promotionCodeCreateInput),
            },
        },
        resolve: async (
            _: any,
            { input }: { input: { couponId: string; code?: string } },
            context: any,
        ) => createPromotionCode(input, context),
    },
    deactivatePromotionCode: {
        type: types.promotionCodeType,
        args: {
            promotionCodeId: { type: new GraphQLNonNull(GraphQLString) },
        },
        resolve: async (
            _: any,
            { promotionCodeId }: { promotionCodeId: string },
            context: any,
        ) => deactivatePromotionCode(promotionCodeId, context),
    },
    createFirstMonthFreeOffer: {
        type: types.firstMonthFreeOffer,
        args: {
            input: {
                type: new GraphQLNonNull(types.firstMonthFreeInput),
            },
        },
        resolve: async (
            _: any,
            { input }: { input: { code?: string; name?: string } },
            context: any,
        ) => createFirstMonthFreeOffer(input, context),
    },
};

export default mutations;
