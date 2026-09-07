import { Constants, Course, catalogMediaUi } from "@courselit/common-models";

export function catalogProductKind(course: Course) {
    if (course.type.toLowerCase() === Constants.CourseType.DOWNLOAD)
        return catalogMediaUi.download;
    if (
        course.paymentPlans?.some(
            (plan) =>
                plan.type.toLowerCase() ===
                Constants.PaymentPlanType.SUBSCRIPTION,
        )
    )
        return catalogMediaUi.membership;
    return catalogMediaUi.class;
}

export function catalogProductPrice(course: Course, currency: string) {
    const plan =
        course.paymentPlans?.find(
            (item) => item.planId === course.defaultPaymentPlan,
        ) ?? course.paymentPlans?.[0];
    let amount = course.cost ?? 0;
    let period = "";
    switch (plan?.type.toLowerCase()) {
        case Constants.PaymentPlanType.FREE:
            amount = 0;
            break;
        case Constants.PaymentPlanType.ONE_TIME:
            amount = plan.oneTimeAmount ?? 0;
            break;
        case Constants.PaymentPlanType.SUBSCRIPTION:
            if (plan.subscriptionMonthlyAmount != null) {
                amount = plan.subscriptionMonthlyAmount;
                period = catalogMediaUi.monthly;
            } else {
                amount = plan.subscriptionYearlyAmount ?? 0;
                period = catalogMediaUi.yearly;
            }
            break;
        case Constants.PaymentPlanType.EMI:
            amount = plan.emiAmount ?? 0;
            period =
                `${catalogMediaUi.monthly} × ${plan.emiTotalInstallments ?? ""}`.trim();
            break;
    }
    return `${currency.toUpperCase()} ${amount.toFixed(2)}${period ? ` ${period}` : ""}`;
}
