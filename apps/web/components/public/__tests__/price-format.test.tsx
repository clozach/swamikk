import { Constants, PaymentPlan } from "@courselit/common-models";
import {
    formatPlanPrice,
    formatPriceText,
    getPlanPrice,
} from "@courselit/utils";
import { getPlanDescription } from "../payments/order-summary";
import { catalogProductPrice } from "../../../../../packages/page-blocks/src/components/catalog-product";

const monthly = {
    planId: "membership",
    type: Constants.PaymentPlanType.SUBSCRIPTION,
    currencyISOCode: "usd",
    subscriptionMonthlyAmount: 11,
} as PaymentPlan;

it("uses the same spaced label for the offer, catalog, checkout and saved prose", () => {
    const expected = "USD 11 / month";
    expect(formatPlanPrice(monthly, "NZD")).toBe(expected);
    expect(getPlanDescription(monthly, "NZD ")).toBe(expected);
    expect(
        catalogProductPrice(
            {
                paymentPlans: [monthly],
                defaultPaymentPlan: monthly.planId,
            } as Parameters<typeof catalogProductPrice>[0],
            "NZD",
        ),
    ).toBe(expected);
    expect(formatPriceText("Membership: USD 11/month.")).toBe(
        `Membership: ${expected}.`,
    );
});

it.each([
    ["USD 11/mo", "USD 11 / month"],
    ["USD 11 /mo", "USD 11 / month"],
    ["USD 11.00 / month", "USD 11 / month"],
    ["nzd 19.95/month", "NZD 19.95 / month"],
    ["USD 1,200/yr", "USD 1,200 / year"],
])("normalizes %s without changing its amount or currency", (before, after) => {
    expect(formatPriceText(before)).toBe(after);
    expect(formatPriceText(after)).toBe(after);
});

it("preserves annual and installment billing amounts", () => {
    const annual = {
        ...monthly,
        subscriptionMonthlyAmount: 0,
        subscriptionYearlyAmount: 110.5,
    };
    expect(formatPlanPrice(annual)).toBe("USD 110.5 / year");
    expect(getPlanPrice(annual).amount).toBe(110.5);
    const installments = {
        ...monthly,
        type: Constants.PaymentPlanType.EMI,
        emiAmount: 19.95,
        emiTotalInstallments: 3,
    };
    expect(getPlanDescription(installments, "USD")).toBe(
        "USD 19.95 / month for 3 months",
    );
});

it("keeps free and one-time prices free of recurring suffixes", () => {
    expect(
        formatPlanPrice({ ...monthly, type: Constants.PaymentPlanType.FREE }),
    ).toBe("USD 0");
    expect(
        formatPlanPrice({
            ...monthly,
            type: Constants.PaymentPlanType.ONE_TIME,
            oneTimeAmount: 9,
        }),
    ).toBe("USD 9");
});

it("leaves ordinary prose and non-price slashes alone", () => {
    const prose = "USD 11 a month. Theory/practice; cancel at any time.";
    expect(formatPriceText(prose)).toBe(prose);
});
