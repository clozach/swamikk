import { LoginProvider } from "./login-provider";
import { Media } from "./media";
import { PaymentMethod } from "./payment-method";
import { SocialHeroConfig, SocialHeroPoolCache } from "./social-hero";

export default interface SiteInfo {
    title?: string;
    subtitle?: string;
    logo?: Partial<Media>;
    currencyISOCode?: string;
    paymentMethod?: PaymentMethod;
    stripeKey?: string;
    codeInjectionHead?: string;
    codeInjectionBody?: string;
    stripeSecret?: string;
    stripeWebhookSecret?: string;
    paypalSecret?: string;
    paytmSecret?: string;
    mailingAddress?: string;
    hideCourseLitBranding?: boolean;
    razorpayKey?: string;
    razorpaySecret?: string;
    razorpayWebhookSecret?: string;
    lemonsqueezyKey?: string;
    lemonsqueezyStoreId?: string;
    lemonsqueezyOneTimeVariantId?: string;
    lemonsqueezySubscriptionMonthlyVariantId?: string;
    lemonsqueezySubscriptionYearlyVariantId?: string;
    lemonsqueezyWebhookSecret?: string;
    logins?: LoginProvider[];
    ssoTrustedDomain?: string;
    /** Social-media hero rotation config. Absent = feature off. */
    socialHero?: SocialHeroConfig;
    /** Server-side stale-while-revalidate cache of the built photo pool. */
    socialHeroPool?: SocialHeroPoolCache;
}
