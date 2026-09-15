import { Constants, PaymentPlan } from "@courselit/common-models";

export const pricePeriods = {
    monthly: "/ month",
    yearly: "/ year",
} as const;

export function getPlanPrice(plan: PaymentPlan | null | undefined): {
    amount: number;
    period: string;
} {
    if (!plan) {
        return { amount: 0, period: "" };
    }
    switch (plan.type) {
        case Constants.PaymentPlanType.FREE:
            return { amount: 0, period: "" };
        case Constants.PaymentPlanType.ONE_TIME:
            return { amount: plan.oneTimeAmount || 0, period: "" };
        case Constants.PaymentPlanType.SUBSCRIPTION:
            if (plan.subscriptionYearlyAmount) {
                return {
                    amount: plan.subscriptionYearlyAmount,
                    period: pricePeriods.yearly,
                };
            }
            return {
                amount: plan.subscriptionMonthlyAmount || 0,
                period: pricePeriods.monthly,
            };
        case Constants.PaymentPlanType.EMI:
            return {
                amount: plan.emiAmount || 0,
                period: pricePeriods.monthly,
            };
        default:
            return { amount: 0, period: "" };
    }
}
