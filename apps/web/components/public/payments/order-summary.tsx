"use client";

import Image from "next/image";
import {
    Button,
    PageCard,
    PageCardContent,
    Text1,
    Text2,
    Header3,
    Header4,
} from "@courselit/page-primitives";
import { PaymentPlan, Constants } from "@courselit/common-models";
import { getPlanPrice } from "@ui-lib/utils";
import { CHECKOUT_PAGE_ORDER_SUMMARY } from "@ui-config/strings";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const { PaymentPlanType: paymentPlanType } = Constants;

/**
 * The Complete Purchase submit button, wrapped so that WHEN IT IS DISABLED a
 * tooltip explains exactly why (a native disabled <button> swallows pointer
 * events, so the tooltip trigger is a span AROUND it). `blockedReason` is the
 * single source of truth for both the disabled state's explanation and,
 * upstream, the disabling itself. No reason ⇒ plain enabled button, no tooltip.
 */
function CompletePurchaseButton({
    theme,
    disabled,
    isSubmitting,
    blockedReason,
    className,
}: {
    theme: any;
    disabled: boolean;
    isSubmitting: boolean;
    blockedReason?: string | null;
    className?: string;
}) {
    const label = isSubmitting ? "Working..." : "Complete Purchase";

    if (!blockedReason) {
        // Enabled (or plainly disabled without an explanation): the button IS
        // the layout slot, so it carries the passed className.
        return (
            <Button
                type="submit"
                disabled={disabled}
                theme={theme.theme}
                className={className}
            >
                {label}
            </Button>
        );
    }

    // Disabled WITH a reason: the wrapper span becomes the layout slot (it
    // carries className + receives the pointer events the disabled button can't),
    // and the button fills it.
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    {/* tabIndex so keyboard users can surface the reason too */}
                    <span
                        tabIndex={0}
                        className={`inline-block ${className ?? ""}`}
                    >
                        <Button
                            type="submit"
                            disabled={disabled}
                            theme={theme.theme}
                            className="w-full"
                        >
                            {label}
                        </Button>
                    </span>
                </TooltipTrigger>
                <TooltipContent>{blockedReason}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export function getPlanDescription(
    plan: PaymentPlan,
    currencySymbol: string,
): string {
    if (!plan) {
        return "N/A";
    }

    switch (plan.type) {
        case paymentPlanType.FREE:
            return "Free plan";
        case paymentPlanType.ONE_TIME:
            return `One-time payment of ${currencySymbol}${plan.oneTimeAmount?.toFixed(2)}`;
        case paymentPlanType.SUBSCRIPTION:
            if (plan.subscriptionYearlyAmount) {
                return `Billed annually at ${currencySymbol}${plan.subscriptionYearlyAmount.toFixed(2)}`;
            }
            return `${currencySymbol}${plan.subscriptionMonthlyAmount?.toFixed(2)} per month`;
        case paymentPlanType.EMI:
            return `${currencySymbol}${plan.emiAmount?.toFixed(2)} per month for ${plan.emiTotalInstallments} months`;
        default:
            return "N/A";
    }
}

export interface Product {
    id: string;
    name: string;
    type: string;
    defaultPaymentPlanId: string;
    slug?: string;
    featuredImage?: string;
    description?: string;
    autoAcceptMembers?: boolean;
    joiningReasonText?: string;
}

export interface PayPanelProps {
    product: Product;
    selectedPlan: PaymentPlan | null;
    paymentPlans: PaymentPlan[];
    currencySymbol: string;
    theme: any;
    submitDisabled: boolean;
    isSubmitting: boolean;
    /** When submit is blocked, the human-readable reason (drives the tooltip). */
    submitBlockedReason?: string | null;
}

export interface MobilePayBarProps {
    selectedPlan: PaymentPlan | null;
    paymentPlans: PaymentPlan[];
    currencySymbol: string;
    theme: any;
    submitDisabled: boolean;
    isSubmitting: boolean;
    /** When submit is blocked, the human-readable reason (drives the tooltip). */
    submitBlockedReason?: string | null;
}

/**
 * Desktop-only sticky "pay panel" — the settled Total plus the Complete
 * Purchase submit button. Rendered inside the checkout <form>, so its
 * type="submit" button drives form.handleSubmit directly (no form id needed).
 */
export function PayPanel({
    product,
    selectedPlan,
    paymentPlans,
    currencySymbol,
    theme,
    submitDisabled,
    isSubmitting,
    submitBlockedReason,
}: PayPanelProps) {
    const plan = selectedPlan || paymentPlans[0] || null;
    const price = getPlanPrice(plan as PaymentPlan);

    return (
        <aside
            className="hidden md:block md:sticky md:top-20 self-start"
            aria-label="Order summary and payment"
        >
            <PageCard theme={theme.theme}>
                <PageCardContent theme={theme.theme} className="p-0">
                    <div className="px-6 py-4 border-b border-border">
                        <Text2
                            theme={theme.theme}
                            className="uppercase tracking-wide font-semibold text-muted-foreground"
                        >
                            {CHECKOUT_PAGE_ORDER_SUMMARY}
                        </Text2>
                    </div>

                    <div className="flex gap-4 px-6 py-5">
                        <div className="h-[72px] w-[72px] relative rounded-lg overflow-hidden border border-border bg-muted shrink-0">
                            <Image
                                src={
                                    product.featuredImage ||
                                    "/courselit_backdrop_square.webp"
                                }
                                alt={product.name}
                                fill
                                sizes="72px"
                                className="object-cover"
                            />
                        </div>
                        <div className="min-w-0">
                            <Header4
                                theme={theme.theme}
                                className="text-base leading-snug"
                            >
                                {product.name}
                            </Header4>
                        </div>
                    </div>

                    <div className="border-t border-border mx-6" />

                    <div className="flex items-baseline justify-between px-6 pt-4">
                        <Text1
                            theme={theme.theme}
                            className="font-semibold uppercase tracking-wide"
                        >
                            Total
                        </Text1>
                        <Header3 theme={theme.theme}>
                            {currencySymbol}
                            {price.amount.toFixed(2)}
                            {price.period && (
                                <span className="text-sm text-muted-foreground ml-1">
                                    {price.period}
                                </span>
                            )}
                        </Header3>
                    </div>

                    {plan && (
                        <Text2
                            theme={theme.theme}
                            className="px-6 pt-1 pb-4 text-muted-foreground"
                        >
                            {getPlanDescription(plan, currencySymbol)}
                        </Text2>
                    )}

                    <div className="px-6 pb-6">
                        <CompletePurchaseButton
                            theme={theme}
                            disabled={submitDisabled}
                            isSubmitting={isSubmitting}
                            blockedReason={submitBlockedReason}
                            className="w-full"
                        />
                    </div>
                </PageCardContent>
            </PageCard>
        </aside>
    );
}

/**
 * Mobile-only fixed bottom pay bar (replaces the old collapsible cart chrome).
 * Rendered inside the checkout <form> so its type="submit" button submits the
 * same action as the desktop panel.
 */
export function MobilePayBar({
    selectedPlan,
    paymentPlans,
    currencySymbol,
    theme,
    submitDisabled,
    isSubmitting,
    submitBlockedReason,
}: MobilePayBarProps) {
    const plan = selectedPlan || paymentPlans[0] || null;
    const price = getPlanPrice(plan as PaymentPlan);

    return (
        <div
            className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-card text-card-foreground border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.12)] px-4 py-3 flex items-center gap-4"
            style={{
                paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
            }}
        >
            <div className="flex flex-col leading-tight shrink-0">
                <span className="text-lg font-semibold">
                    {currencySymbol}
                    {price.amount.toFixed(2)}
                    {price.period && (
                        <span className="text-xs text-muted-foreground ml-1">
                            {price.period}
                        </span>
                    )}
                </span>
                {plan?.type === paymentPlanType.ONE_TIME && (
                    <span className="text-xs text-muted-foreground">
                        one-time
                    </span>
                )}
            </div>
            <CompletePurchaseButton
                theme={theme}
                disabled={submitDisabled}
                isSubmitting={isSubmitting}
                blockedReason={submitBlockedReason}
                className="flex-1"
            />
        </div>
    );
}
