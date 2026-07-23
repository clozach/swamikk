import { SiteInfo, Constants } from "@courselit/common-models";
import mongoose from "mongoose";
import { MediaSchema } from "./media";

/**
 * One social-hero feed source. Stored as a PERMISSIVE SUPERSET of the
 * `SocialFeedSource` tagged union — every per-kind field is optional here and
 * `kind` selects which subset is meaningful. The discriminated shape is
 * enforced at the write boundary by zod (see the settings GraphQL layer), so
 * the DB never has to model the union directly.
 *
 * ⚠️ `accessToken` is SERVER-ONLY — the public `getSiteInfo` resolver excludes
 * it via projection and no public output type exposes it.
 */
const SocialFeedSourceSchema = new mongoose.Schema(
    {
        kind: {
            type: String,
            enum: ["instagram", "facebook", "manual"],
            required: true,
        },
        id: { type: String, required: true },
        label: { type: String, required: true },
        // instagram / facebook
        igUserId: { type: String },
        pageId: { type: String },
        accessToken: { type: String },
        limit: { type: Number },
        // manual
        imageUrl: { type: String },
        postUrl: { type: String },
        networkDomain: { type: String },
        alt: { type: String },
    },
    { _id: false },
);

const SocialHeroConfigSchema = new mongoose.Schema(
    {
        enabled: { type: Boolean, default: false },
        rotationSeconds: { type: Number, default: 60 },
        poolRefreshMinutes: { type: Number, default: 60 },
        sources: { type: [SocialFeedSourceSchema], default: [] },
    },
    { _id: false },
);

export const SettingsSchema = new mongoose.Schema<SiteInfo>({
    title: { type: String },
    subtitle: { type: String },
    logo: MediaSchema,
    currencyISOCode: { type: String, maxlength: 3 },
    paymentMethod: { type: String, enum: Constants.paymentMethods },
    stripeKey: { type: String },
    codeInjectionHead: { type: String },
    codeInjectionBody: { type: String },
    stripeSecret: { type: String },
    stripeWebhookSecret: { type: String },
    paytmSecret: { type: String },
    paypalSecret: { type: String },
    mailingAddress: { type: String },
    hideCourseLitBranding: { type: Boolean, default: false },
    razorpayKey: { type: String },
    razorpaySecret: { type: String },
    razorpayWebhookSecret: { type: String },
    lemonsqueezyKey: { type: String },
    lemonsqueezyStoreId: { type: String },
    lemonsqueezyWebhookSecret: { type: String },
    lemonsqueezyOneTimeVariantId: { type: String },
    lemonsqueezySubscriptionMonthlyVariantId: { type: String },
    lemonsqueezySubscriptionYearlyVariantId: { type: String },
    logins: { type: [String], enum: Object.values(Constants.LoginProvider) },
    ssoTrustedDomain: { type: String },
    socialHero: { type: SocialHeroConfigSchema },
    // Derived server-side SWR cache of the built pool — permissive Mixed; the
    // pool builder is its only writer and the shape (SocialHeroPoolCache) is
    // enforced in app code, not the DB.
    socialHeroPool: { type: mongoose.Schema.Types.Mixed },
});
