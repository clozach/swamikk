import { Constants, UIConstants } from "@courselit/common-models";
import Domain from "@models/Domain";
import Course from "@models/Course";
import Plan from "@models/PaymentPlan";
import { updatePlan, getPlans } from "../logic";
import { getPaymentMethodFromSettings } from "@/payments-new";
import { catalogProductPrice } from "../../../../../packages/page-blocks/src/components/catalog-product";

describe("membership currency independent of the site", () => {
    let domain: any;
    let ctx: any;
    const courseId = "usd-membership-currency-test";
    const planId = "usd-membership-plan-test";
    beforeAll(async () => {
        domain = await Domain.create({
            name: "usd-membership-test",
            email: "usd@example.com",
            settings: {
                title: "School",
                currencyISOCode: "nzd",
                paymentMethod: UIConstants.PAYMENT_METHOD_STRIPE,
                stripeKey: "pk_test_fixture",
                stripeSecret: "sk_test_fixture",
            },
        });
        ctx = {
            subdomain: domain,
            user: { userId: "owner", permissions: ["course:manage_any"] },
        };
        await Course.create({
            domain: domain._id,
            courseId,
            title: "Membership",
            creatorId: "owner",
            type: "course",
            privacy: "public",
            slug: courseId,
            costType: "free",
            cost: 0,
        });
        await Plan.create({
            domain: domain._id,
            planId,
            name: "Monthly",
            type: "subscription",
            entityId: courseId,
            entityType: "course",
            userId: "owner",
            subscriptionMonthlyAmount: 11,
        });
    });
    it("persists USD through the native save and preserves it on later name-only saves", async () => {
        await updatePlan({ planId, currencyISOCode: "USD", ctx });
        await updatePlan({ planId, name: "Monthly Membership", ctx });
        const [plan] = await getPlans({
            entityId: courseId,
            entityType: "course",
            ctx,
        });
        expect(plan.currencyISOCode).toBe("usd");
        expect(plan.subscriptionMonthlyAmount).toBe(11);
        expect(
            (await Domain.findById(domain._id))!.settings.currencyISOCode,
        ).toBe("nzd");
        expect(
            catalogProductPrice({ paymentPlans: [plan] } as any, "nzd"),
        ).toBe("USD 11 / month");
    });
    it("creates an 1100-cent USD monthly Stripe request with matching invoice currency", async () => {
        const provider: any = await getPaymentMethodFromSettings(
            domain.settings,
            undefined,
            "usd",
        );
        provider.stripe.checkout.sessions.create = jest
            .fn()
            .mockResolvedValue({ url: "https://checkout.stripe.com/test" });
        const currency = await provider.getCurrencyISOCode();
        await provider.initiate({
            metadata: {
                invoiceId: "invoice",
                membershipId: "membership",
                currencyISOCode: currency,
            },
            paymentPlan: {
                type: Constants.PaymentPlanType.SUBSCRIPTION,
                subscriptionMonthlyAmount: 11,
            },
            product: {
                id: courseId,
                title: "Members' Library",
                type: "course",
            },
            origin: "https://school.test",
        });
        expect(provider.stripe.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                line_items: [
                    expect.objectContaining({
                        price_data: expect.objectContaining({
                            currency: "usd",
                            unit_amount: 1100,
                            recurring: { interval: "month" },
                        }),
                    }),
                ],
                metadata: expect.objectContaining({ currencyISOCode: "usd" }),
            }),
        );
        expect(domain.settings.currencyISOCode).toBe("nzd");
        const other = await getPaymentMethodFromSettings(domain.settings);
        expect(await other!.getCurrencyISOCode()).toBe("nzd");
        expect(
            catalogProductPrice(
                {
                    paymentPlans: [{ type: "onetime", oneTimeAmount: 247 }],
                } as any,
                "nzd",
            ),
        ).toBe("NZD 247");
    });
    it("rejects invalid currencies and unprivileged updates without changing the saved plan", async () => {
        await expect(
            updatePlan({ planId, currencyISOCode: "BAD", ctx }),
        ).rejects.toThrow();
        await expect(
            updatePlan({
                planId,
                currencyISOCode: "nzd",
                ctx: { ...ctx, user: { userId: "member", permissions: [] } },
            }),
        ).rejects.toThrow();
        expect((await Plan.findOne({ planId }))!.currencyISOCode).toBe("usd");
    });
    it("refuses a currency override for providers that cannot honor it", async () => {
        await expect(
            getPaymentMethodFromSettings(
                {
                    ...domain.settings,
                    paymentMethod: UIConstants.PAYMENT_METHOD_LEMONSQUEEZY,
                },
                undefined,
                "usd",
            ),
        ).rejects.toThrow("Per-plan currency");
    });
});

it("does not disclose plans for a dormant community", async () => {
    const domain = await Domain.create({
        name: "dormant-community-plans",
        email: "dormant@example.test",
    });
    const plan = await Plan.create({
        domain: domain._id,
        planId: "dormant-community-plan",
        entityId: "dormant-community",
        entityType: "community",
        name: "Stored plan",
        type: "free",
        userId: "owner",
    });
    expect(
        await getPlans({
            entityId: "dormant-community",
            entityType: "community",
            ctx: { subdomain: domain },
        }),
    ).toEqual([]);
    expect(await Plan.exists({ _id: plan._id })).toBeTruthy();
    await Plan.deleteOne({ _id: plan._id });
    await Domain.deleteOne({ _id: domain._id });
});
