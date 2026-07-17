import {
    GraphQLObjectType,
    GraphQLInputObjectType,
    GraphQLString,
    GraphQLBoolean,
    GraphQLFloat,
    GraphQLInt,
    GraphQLNonNull,
    GraphQLList,
} from "graphql";

// A Stripe Promotion Code — the customer-facing code that applies a coupon at
// checkout. Stripe has no delete for promotion codes; "deactivate" sets
// active: false.
const promotionCodeType = new GraphQLObjectType({
    name: "PromotionCode",
    fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        code: { type: new GraphQLNonNull(GraphQLString) },
        active: { type: new GraphQLNonNull(GraphQLBoolean) },
        couponId: { type: GraphQLString },
        timesRedeemed: { type: GraphQLInt },
        maxRedemptions: { type: GraphQLInt },
        // Unix seconds (Stripe-native), nullable.
        expiresAt: { type: GraphQLFloat },
        created: { type: GraphQLFloat },
    },
});

// A Stripe Coupon — the discount definition. Values mirror Stripe's own units:
// percentOff is 0–100; amountOff is in the currency's smallest unit (e.g.
// cents). The admin UI is responsible for humane display (dollars, etc.).
const couponType = new GraphQLObjectType({
    name: "Coupon",
    fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        name: { type: GraphQLString },
        percentOff: { type: GraphQLFloat },
        amountOff: { type: GraphQLInt },
        currency: { type: GraphQLString },
        duration: { type: new GraphQLNonNull(GraphQLString) },
        durationInMonths: { type: GraphQLInt },
        timesRedeemed: { type: GraphQLInt },
        valid: { type: GraphQLBoolean },
        created: { type: GraphQLFloat },
        promotionCodes: { type: new GraphQLList(promotionCodeType) },
    },
});

const couponCreateInput = new GraphQLInputObjectType({
    name: "CouponCreateInput",
    fields: {
        name: { type: GraphQLString },
        // Provide exactly one of percentOff or amountOff.
        percentOff: { type: GraphQLFloat },
        amountOff: { type: GraphQLInt },
        // Required with amountOff; defaults to the domain's currency.
        currency: { type: GraphQLString },
        // once | repeating | forever
        duration: { type: new GraphQLNonNull(GraphQLString) },
        // Required when duration is "repeating".
        durationInMonths: { type: GraphQLInt },
    },
});

const promotionCodeCreateInput = new GraphQLInputObjectType({
    name: "PromotionCodeCreateInput",
    fields: {
        couponId: { type: new GraphQLNonNull(GraphQLString) },
        // Optional custom code; Stripe auto-generates one when omitted.
        code: { type: GraphQLString },
    },
});

const firstMonthFreeInput = new GraphQLInputObjectType({
    name: "FirstMonthFreeInput",
    fields: {
        // Optional custom promotion code; Stripe auto-generates when omitted.
        code: { type: GraphQLString },
        // Optional coupon name; defaults to "First month free".
        name: { type: GraphQLString },
    },
});

const firstMonthFreeOffer = new GraphQLObjectType({
    name: "FirstMonthFreeOffer",
    fields: {
        coupon: { type: new GraphQLNonNull(couponType) },
        promotionCode: { type: new GraphQLNonNull(promotionCodeType) },
    },
});

const types = {
    couponType,
    promotionCodeType,
    couponCreateInput,
    promotionCodeCreateInput,
    firstMonthFreeInput,
    firstMonthFreeOffer,
};

export default types;
