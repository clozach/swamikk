import Stripe from "stripe";
import { checkIfAuthenticated } from "../../lib/graphql";
import { responses } from "../../config/strings";
import constants from "../../config/constants";
import type GQLContext from "../../models/GQLContext";
import DomainModel, { Domain } from "../../models/Domain";
import { checkPermission } from "@courselit/utils";
import { UIConstants } from "@courselit/common-models";

const { permissions } = constants;

const COUPON_DURATIONS = ["once", "repeating", "forever"] as const;

const assertCanManageSettings = (ctx: GQLContext) => {
    checkIfAuthenticated(ctx);
    if (!checkPermission(ctx.user.permissions, [permissions.manageSettings])) {
        throw new Error(responses.action_not_allowed);
    }
};

// Loads the domain's per-domain Stripe secret server-side and returns a client
// bound to it. The secret is read from Mongo (never the request) and never
// leaves this process. Throws if the domain isn't on Stripe or has no secret.
const getStripeForDomain = async (
    ctx: GQLContext,
): Promise<{ stripe: Stripe; currencyISOCode?: string }> => {
    const domain: Domain | null = await DomainModel.findById(ctx.subdomain._id);
    if (
        !domain ||
        !domain.settings ||
        domain.settings.paymentMethod !== UIConstants.PAYMENT_METHOD_STRIPE ||
        !domain.settings.stripeSecret
    ) {
        throw new Error(responses.stripe_not_configured);
    }
    // Mirror payments-new/stripe-payment.ts: no pinned apiVersion.
    const stripe = new Stripe(domain.settings.stripeSecret, {
        typescript: true,
    });
    return { stripe, currencyISOCode: domain.settings.currencyISOCode };
};

const toPromotionCodeDTO = (pc: Stripe.PromotionCode) => ({
    id: pc.id,
    code: pc.code,
    active: pc.active,
    couponId:
        typeof pc.coupon === "string" ? pc.coupon : (pc.coupon?.id ?? null),
    timesRedeemed: pc.times_redeemed ?? null,
    maxRedemptions: pc.max_redemptions ?? null,
    expiresAt: pc.expires_at ?? null,
    created: pc.created ?? null,
});

const toCouponDTO = (
    coupon: Stripe.Coupon,
    promotionCodes: Stripe.PromotionCode[] = [],
) => ({
    id: coupon.id,
    name: coupon.name ?? null,
    percentOff: coupon.percent_off ?? null,
    amountOff: coupon.amount_off ?? null,
    currency: coupon.currency ?? null,
    duration: coupon.duration,
    durationInMonths: coupon.duration_in_months ?? null,
    timesRedeemed: coupon.times_redeemed ?? null,
    valid: coupon.valid ?? null,
    created: coupon.created ?? null,
    promotionCodes: promotionCodes.map(toPromotionCodeDTO),
});

export const listCoupons = async (ctx: GQLContext) => {
    assertCanManageSettings(ctx);
    const { stripe } = await getStripeForDomain(ctx);

    const coupons = await stripe.coupons.list({ limit: 100 });
    const promotionCodes = await stripe.promotionCodes.list({ limit: 100 });

    const byCoupon = new Map<string, Stripe.PromotionCode[]>();
    for (const pc of promotionCodes.data) {
        const couponId =
            typeof pc.coupon === "string" ? pc.coupon : pc.coupon?.id;
        if (!couponId) {
            continue;
        }
        const list = byCoupon.get(couponId) ?? [];
        list.push(pc);
        byCoupon.set(couponId, list);
    }

    return coupons.data.map((coupon) =>
        toCouponDTO(coupon, byCoupon.get(coupon.id) ?? []),
    );
};

export const createCoupon = async (
    input: {
        name?: string;
        percentOff?: number;
        amountOff?: number;
        currency?: string;
        duration: string;
        durationInMonths?: number;
    },
    ctx: GQLContext,
) => {
    assertCanManageSettings(ctx);
    const { stripe, currencyISOCode } = await getStripeForDomain(ctx);

    const hasPercent =
        input.percentOff !== undefined && input.percentOff !== null;
    const hasAmount = input.amountOff !== undefined && input.amountOff !== null;
    if (hasPercent === hasAmount) {
        throw new Error(responses.coupon_discount_invalid);
    }
    if (!COUPON_DURATIONS.includes(input.duration as any)) {
        throw new Error(responses.coupon_duration_invalid);
    }
    if (input.duration === "repeating" && !input.durationInMonths) {
        throw new Error(responses.coupon_duration_months_required);
    }

    const params: Stripe.CouponCreateParams = {
        duration: input.duration as Stripe.CouponCreateParams.Duration,
    };
    if (input.name) {
        params.name = input.name;
    }
    if (hasPercent) {
        params.percent_off = input.percentOff;
    } else {
        params.amount_off = input.amountOff;
        const currency = (
            input.currency ||
            currencyISOCode ||
            ""
        ).toLowerCase();
        if (!currency) {
            throw new Error(responses.currency_iso_not_set);
        }
        params.currency = currency;
    }
    if (input.duration === "repeating") {
        params.duration_in_months = input.durationInMonths;
    }

    const coupon = await stripe.coupons.create(params);
    return toCouponDTO(coupon);
};

export const deleteCoupon = async (couponId: string, ctx: GQLContext) => {
    assertCanManageSettings(ctx);
    const { stripe } = await getStripeForDomain(ctx);

    const deleted = await stripe.coupons.del(couponId);
    return !!deleted.deleted;
};

export const listPromotionCodes = async (
    couponId: string | undefined,
    ctx: GQLContext,
) => {
    assertCanManageSettings(ctx);
    const { stripe } = await getStripeForDomain(ctx);

    const params: Stripe.PromotionCodeListParams = { limit: 100 };
    if (couponId) {
        params.coupon = couponId;
    }
    const promotionCodes = await stripe.promotionCodes.list(params);
    return promotionCodes.data.map(toPromotionCodeDTO);
};

export const createPromotionCode = async (
    input: { couponId: string; code?: string },
    ctx: GQLContext,
) => {
    assertCanManageSettings(ctx);
    const { stripe } = await getStripeForDomain(ctx);

    const params: Stripe.PromotionCodeCreateParams = { coupon: input.couponId };
    if (input.code) {
        params.code = input.code;
    }
    const promotionCode = await stripe.promotionCodes.create(params);
    return toPromotionCodeDTO(promotionCode);
};

export const deactivatePromotionCode = async (
    promotionCodeId: string,
    ctx: GQLContext,
) => {
    assertCanManageSettings(ctx);
    const { stripe } = await getStripeForDomain(ctx);

    const promotionCode = await stripe.promotionCodes.update(promotionCodeId, {
        active: false,
    });
    return toPromotionCodeDTO(promotionCode);
};

// One-call convenience: a 100%-off, once coupon plus a promotion code. On a
// subscription plan this zeroes the first invoice only. Because CourseLit's
// checkout uses allow_promotion_codes (not discounts:[...]), the buyer must
// TYPE the returned code — auto-apply would require extending initiate().
export const createFirstMonthFreeOffer = async (
    input: { code?: string; name?: string },
    ctx: GQLContext,
) => {
    assertCanManageSettings(ctx);
    const { stripe } = await getStripeForDomain(ctx);

    const coupon = await stripe.coupons.create({
        percent_off: 100,
        duration: "once",
        name: input.name || "First month free",
    });

    const promotionCodeParams: Stripe.PromotionCodeCreateParams = {
        coupon: coupon.id,
    };
    if (input.code) {
        promotionCodeParams.code = input.code;
    }
    const promotionCode =
        await stripe.promotionCodes.create(promotionCodeParams);

    return {
        coupon: toCouponDTO(coupon, [promotionCode]),
        promotionCode: toPromotionCodeDTO(promotionCode),
    };
};
