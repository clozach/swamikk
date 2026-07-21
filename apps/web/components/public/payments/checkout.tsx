"use client";

import { useContext, useEffect, useState } from "react";
import Image from "next/image";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { RadioGroup } from "@/components/ui/radio-group";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Check, X } from "lucide-react";
import { LoginForm } from "./login-form";
import {
    PaymentPlan,
    Constants,
    MembershipEntityType,
    UIConstants,
    MembershipStatus,
    Course,
} from "@courselit/common-models";
import {
    AddressContext,
    ProfileContext,
    SiteInfoContext,
    ThemeContext,
} from "@components/contexts";
import { FetchBuilder } from "@courselit/utils";
import { useRouter } from "next/navigation";
import { getSymbolFromCurrency, useToast } from "@courselit/components-library";
import Script from "next/script";
import {
    Button,
    Header3,
    Text1,
    Text2,
    PageCard,
    PageCardContent,
} from "@courselit/page-primitives";
import { PaymentPlanCard } from "./payment-plan-card";
import { PayPanel, MobilePayBar, getPlanDescription } from "./order-summary";
import { getPlanPrice } from "@ui-lib/utils";
import type { RuntimeLoginProvider } from "@/lib/login-providers";
import { LOGIN_FORM_PERSONAL_INFORMATION_LABEL } from "@ui-config/strings";
const { PaymentPlanType: paymentPlanType } = Constants;

export interface Product {
    id: string;
    name: string;
    type: MembershipEntityType;
    defaultPaymentPlanId: string;
    slug?: string;
    featuredImage?: string;
    description?: string;
    autoAcceptMembers?: boolean;
    joiningReasonText?: string;
}

export interface CheckoutScreenProps {
    product: Product;
    paymentPlans: PaymentPlan[];
    includedProducts: Course[];
    loginProviders?: RuntimeLoginProvider[];
    type?: MembershipEntityType;
    id?: string;
}

const formSchema = z.object({
    selectedPlan: z.string().min(1, "Please select a plan"),
    joiningReason: z.string().optional(),
});

export default function Checkout({
    product,
    paymentPlans,
    includedProducts,
    loginProviders = [],
    type,
    id,
}: CheckoutScreenProps) {
    const siteinfo = useContext(SiteInfoContext);
    const { profile } = useContext(ProfileContext);
    const address = useContext(AddressContext);
    const currencySymbol =
        getSymbolFromCurrency(siteinfo.currencyISOCode || "USD") || "$";

    const [selectedPlan, setSelectedPlan] = useState<PaymentPlan | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(!!profile?.email);
    const [userEmail, setUserEmail] = useState(profile?.email || "");
    const [userName, setUserName] = useState(profile?.name || "");
    const [membershipStatus, setMembershipStatus] = useState<
        MembershipStatus | undefined
    >();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const router = useRouter();
    const { toast } = useToast();
    const { theme } = useContext(ThemeContext);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema as any),
        defaultValues: {
            selectedPlan: product.defaultPaymentPlanId || "",
            joiningReason: "",
        },
    });

    useEffect(() => {
        const fetchMembership = async () => {
            const query = `
                query ($entityId: String!, $entityType: MembershipEntityType!) {
                    membershipStatus: getMembershipStatus(entityId: $entityId, entityType: $entityType)
                }
            `;
            const fetch = new FetchBuilder()
                .setUrl(`${address.backend}/api/graph`)
                .setIsGraphQLEndpoint(true)
                .setPayload({
                    query,
                    variables: {
                        entityId: product.id,
                        entityType: product.type.toUpperCase(),
                    },
                })
                .build();

            try {
                const response = await fetch.exec();
                if (response.membershipStatus) {
                    setMembershipStatus(
                        response.membershipStatus.toLowerCase(),
                    );
                }
            } catch (err) {
                toast({
                    title: "Error",
                    description: err.message,
                    variant: "destructive",
                });
            }
        };

        if (profile?.userId) {
            fetchMembership();
        }
    }, [profile]);

    useEffect(() => {
        const initializeSelectedPlanWithDefaultPaymentPlan = () => {
            if (paymentPlans.length > 0) {
                let planToSelect: PaymentPlan | null = null;

                if (product.defaultPaymentPlanId) {
                    planToSelect =
                        paymentPlans.find(
                            (plan) =>
                                plan.planId === product.defaultPaymentPlanId,
                        ) || null;
                }

                if (!planToSelect && paymentPlans.length === 1) {
                    planToSelect = paymentPlans[0];
                }

                if (planToSelect) {
                    setSelectedPlan(planToSelect);
                    form.setValue("selectedPlan", planToSelect.planId);
                    form.trigger("selectedPlan");
                }
            }
        };

        initializeSelectedPlanWithDefaultPaymentPlan();
    }, [paymentPlans, product.defaultPaymentPlanId, form]);

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true);
        const { paymentMethod } = siteinfo;

        let payload: Record<string, unknown> | null = {
            joiningReason: values.joiningReason,
            id: product.id,
            type: product.type,
            planId: selectedPlan!.planId,
            origin: address.frontend,
        };

        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/payment/initiate`)
            .setHeaders({
                "Content-Type": "application/json",
            })
            .setPayload(JSON.stringify(payload))
            .build();

        try {
            const response = await fetch.exec();
            if (response.status === "initiated") {
                if (paymentMethod === UIConstants.PAYMENT_METHOD_STRIPE) {
                    // paymentTracker is the hosted Stripe Checkout URL. Redirect
                    // with a plain top-level navigation instead of loading
                    // Stripe.js and calling the deprecated redirectToCheckout —
                    // that kept injecting the m-outer/inner.html metrics iframe
                    // Safari saves to disk, especially on bfcache back-and-forth.
                    window.location.assign(response.paymentTracker);
                }
                if (paymentMethod === UIConstants.PAYMENT_METHOD_RAZORPAY) {
                    const razorpayPayload = {
                        key: siteinfo.razorpayKey,
                        name: product.name,
                        image: product.featuredImage || siteinfo.logo?.file,
                        prefill: {
                            email: profile?.email || "",
                        },
                        handler: function (response) {
                            verifySignature(response);
                        },
                    };
                    if (
                        selectedPlan?.type === paymentPlanType.SUBSCRIPTION ||
                        selectedPlan?.type === paymentPlanType.EMI
                    ) {
                        razorpayPayload["subscription_id"] =
                            response.paymentTracker;
                    } else {
                        razorpayPayload["order_id"] = response.paymentTracker;
                        // razorpayPayload["handler"] = function (response) {
                        //     verifySignature(response);
                        // }
                    }
                    // @ts-ignore
                    const rzp1 = new Razorpay(razorpayPayload);
                    rzp1.open();
                }
                if (paymentMethod === UIConstants.PAYMENT_METHOD_LEMONSQUEEZY) {
                    (window as any).LemonSqueezy.Url.Open(
                        response.paymentTracker,
                    );
                }
            } else if (response.status === "success") {
                if (product.type === Constants.MembershipEntityType.COMMUNITY) {
                    router.replace(
                        `/dashboard/community/${product.id}?success=true`,
                    );
                }
                if (product.type === Constants.MembershipEntityType.COURSE) {
                    router.replace(
                        `/course/${product.slug}/${product.id}?success=true`,
                    );
                }
            }
        } catch (err) {
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    const verifySignature = async (response) => {
        const payload = {
            signature: response.razorpay_signature,
            paymentId: response.razorpay_payment_id,
        };
        if (
            selectedPlan?.type === paymentPlanType.SUBSCRIPTION ||
            selectedPlan?.type === paymentPlanType.EMI
        ) {
            payload["subscriptionId"] = response.razorpay_subscription_id;
        } else {
            payload["orderId"] = response.razorpay_order_id;
        }
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/payment/vendor/razorpay/verify-new`)
            .setHeaders({
                "Content-Type": "application/json",
            })
            .setPayload(JSON.stringify(payload))
            .build();

        try {
            const verifyResponse = await fetch.exec();
            router.replace(`/checkout/verify?id=${verifyResponse.purchaseId}`);
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive",
            });
        }
    };

    const handlePlanSelection = (planId: string) => {
        const plan = paymentPlans.find((p) => p.planId === planId);
        setSelectedPlan(plan || null);
        form.setValue("selectedPlan", planId);
    };

    const handleLoginComplete = (email: string, name: string) => {
        setIsLoggedIn(true);
        setUserEmail(email);
        setUserName(name);
    };

    useEffect(() => {
        function setupLemonSqueezy() {
            if (typeof (window as any).createLemonSqueezy !== "undefined") {
                (window as any).createLemonSqueezy();
            }
        }

        if (
            siteinfo.paymentMethod === UIConstants.PAYMENT_METHOD_LEMONSQUEEZY
        ) {
            setupLemonSqueezy();
        }
    }, [siteinfo, (window as any).createLemonSqueezy]);

    // watch (not getValues) so the button re-enables the moment a free-
    // community joiningReason is typed — getValues is not reactive.
    const joiningReasonValue = form.watch("joiningReason");
    const submitDisabled =
        isSubmitting ||
        !isLoggedIn ||
        !form.formState.isValid ||
        (selectedPlan?.type === paymentPlanType.FREE &&
            product.type === Constants.MembershipEntityType.COMMUNITY &&
            !joiningReasonValue);

    const isBlocked =
        membershipStatus === Constants.MembershipStatus.ACTIVE ||
        membershipStatus === Constants.MembershipStatus.REJECTED;

    return (
        <div className="min-h-screen w-full">
            <div className="w-full pb-32 md:pb-0">
                {isBlocked ? (
                    <div className="space-y-4">
                        <Header3 theme={theme.theme}>
                            {membershipStatus ===
                            Constants.MembershipStatus.ACTIVE ? (
                                <Check />
                            ) : (
                                <X />
                            )}
                            {membershipStatus ===
                            Constants.MembershipStatus.ACTIVE
                                ? "Already owned"
                                : "Access Denied"}
                        </Header3>
                        <Text1 theme={theme.theme}>
                            {membershipStatus ===
                            Constants.MembershipStatus.ACTIVE
                                ? "You already have access to this resource."
                                : "You have been rejected and cannot proceed with the checkout."}
                        </Text1>
                        {membershipStatus ===
                            Constants.MembershipStatus.ACTIVE && (
                            <Button
                                onClick={() => {
                                    if (
                                        product.type ===
                                        Constants.MembershipEntityType.COMMUNITY
                                    ) {
                                        router.replace(
                                            `/dashboard/community/${product.id}`,
                                        );
                                    } else if (
                                        product.type ===
                                        Constants.MembershipEntityType.COURSE
                                    ) {
                                        router.replace(
                                            `/course/${product.slug}/${product.id}`,
                                        );
                                    }
                                }}
                                theme={theme.theme}
                            >
                                Go to the resource
                            </Button>
                        )}
                    </div>
                ) : (
                    <FormProvider {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)}>
                            <div className="grid gap-8 md:gap-10 items-start md:grid-cols-[minmax(0,1fr)_360px]">
                                {/* ===== LEFT: product + who's buying + plan ===== */}
                                <div className="space-y-8 min-w-0">
                                    {/* Product presentation — a compact media
                                        object (thumbnail + name/description),
                                        text-forward like The Counter rather
                                        than a dominating hero image. */}
                                    <PageCard theme={theme.theme}>
                                        <PageCardContent
                                            theme={theme.theme}
                                            className="flex items-start gap-4 sm:gap-5"
                                        >
                                            <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-lg overflow-hidden bg-muted">
                                                <Image
                                                    src={
                                                        product.featuredImage ||
                                                        "/courselit_backdrop_square.webp"
                                                    }
                                                    alt={product.name}
                                                    fill
                                                    sizes="112px"
                                                    className="object-cover"
                                                />
                                            </div>
                                            <div className="min-w-0 space-y-2">
                                                <Header3 theme={theme.theme}>
                                                    {product.name}
                                                </Header3>
                                                {product.description && (
                                                    <Text1
                                                        theme={theme.theme}
                                                        className="text-muted-foreground"
                                                    >
                                                        {product.description}
                                                    </Text1>
                                                )}
                                            </div>
                                        </PageCardContent>
                                    </PageCard>

                                    {/* Personal information */}
                                    <div className="space-y-4">
                                        <Header3 theme={theme.theme}>
                                            {
                                                LOGIN_FORM_PERSONAL_INFORMATION_LABEL
                                            }
                                        </Header3>
                                        {!isLoggedIn ? (
                                            <LoginForm
                                                onLoginComplete={
                                                    handleLoginComplete
                                                }
                                                loginProviders={loginProviders}
                                                type={type}
                                                id={id}
                                            />
                                        ) : (
                                            <div className="text-sm space-y-2">
                                                <Text1 theme={theme.theme}>
                                                    <span className="font-semibold">
                                                        Email:
                                                    </span>{" "}
                                                    {userEmail}
                                                </Text1>
                                                <Text1 theme={theme.theme}>
                                                    <span className="font-semibold">
                                                        Name:
                                                    </span>{" "}
                                                    {userName}
                                                </Text1>
                                            </div>
                                        )}
                                    </div>

                                    {/* Plan: single settled price line OR multi radio selector */}
                                    {paymentPlans.length === 1 ? (
                                        <div className="space-y-4">
                                            <Header3 theme={theme.theme}>
                                                Your plan
                                            </Header3>
                                            <PageCard theme={theme.theme}>
                                                <PageCardContent
                                                    theme={theme.theme}
                                                    className="flex items-baseline justify-between gap-4 flex-wrap"
                                                >
                                                    <div className="flex flex-col gap-0.5">
                                                        <Text1
                                                            theme={theme.theme}
                                                        >
                                                            {
                                                                (
                                                                    selectedPlan ||
                                                                    paymentPlans[0]
                                                                )?.name
                                                            }
                                                        </Text1>
                                                        <Text2
                                                            theme={theme.theme}
                                                            className="text-muted-foreground"
                                                        >
                                                            {getPlanDescription(
                                                                selectedPlan ||
                                                                    paymentPlans[0],
                                                                currencySymbol,
                                                            )}
                                                        </Text2>
                                                    </div>
                                                    <Header3
                                                        theme={theme.theme}
                                                    >
                                                        {currencySymbol}
                                                        {getPlanPrice(
                                                            selectedPlan ||
                                                                paymentPlans[0],
                                                        ).amount.toFixed(2)}
                                                        {getPlanPrice(
                                                            selectedPlan ||
                                                                paymentPlans[0],
                                                        ).period && (
                                                            <span className="text-sm text-muted-foreground ml-1">
                                                                {
                                                                    getPlanPrice(
                                                                        selectedPlan ||
                                                                            paymentPlans[0],
                                                                    ).period
                                                                }
                                                            </span>
                                                        )}
                                                    </Header3>
                                                </PageCardContent>
                                            </PageCard>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <Header3 theme={theme.theme}>
                                                Select Your Plan
                                            </Header3>
                                            <FormField
                                                control={form.control}
                                                name="selectedPlan"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-4">
                                                        <FormControl>
                                                            <RadioGroup
                                                                onValueChange={(
                                                                    value,
                                                                ) => {
                                                                    field.onChange(
                                                                        value,
                                                                    );
                                                                    handlePlanSelection(
                                                                        value,
                                                                    );
                                                                }}
                                                                value={
                                                                    field.value
                                                                }
                                                                className="space-y-4"
                                                            >
                                                                {paymentPlans.map(
                                                                    (plan) => {
                                                                        const isRecommended =
                                                                            paymentPlans.length >
                                                                                1 &&
                                                                            plan.planId ===
                                                                                product.defaultPaymentPlanId;

                                                                        return (
                                                                            <PaymentPlanCard
                                                                                key={
                                                                                    plan.planId
                                                                                }
                                                                                plan={
                                                                                    plan
                                                                                }
                                                                                isSelected={
                                                                                    field.value ===
                                                                                    plan.planId
                                                                                }
                                                                                isRecommended={
                                                                                    isRecommended
                                                                                }
                                                                                isLoggedIn={
                                                                                    isLoggedIn
                                                                                }
                                                                                currencySymbol={
                                                                                    currencySymbol
                                                                                }
                                                                                includedProducts={
                                                                                    includedProducts
                                                                                }
                                                                                theme={
                                                                                    theme
                                                                                }
                                                                            />
                                                                        );
                                                                    },
                                                                )}
                                                            </RadioGroup>
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    )}

                                    {/* FREE community — reason for joining */}
                                    {selectedPlan?.type ===
                                        paymentPlanType.FREE &&
                                        product.type ===
                                            Constants.MembershipEntityType
                                                .COMMUNITY && (
                                            <FormField
                                                control={form.control}
                                                name="joiningReason"
                                                render={({ field }) => (
                                                    <FormItem className="mb-6">
                                                        <FormLabel className="text-sm font-semibold mb-4">
                                                            {product.joiningReasonText ||
                                                                "Reason for joining"}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <textarea
                                                                className="w-full border rounded p-2"
                                                                {...field}
                                                                placeholder="Please provide your reason for joining"
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                </div>

                                {/* ===== RIGHT: sticky pay panel (desktop) ===== */}
                                <PayPanel
                                    product={product}
                                    selectedPlan={selectedPlan}
                                    paymentPlans={paymentPlans}
                                    currencySymbol={currencySymbol}
                                    theme={theme}
                                    submitDisabled={submitDisabled}
                                    isSubmitting={isSubmitting}
                                />
                            </div>

                            {/* Mobile-only fixed bottom pay bar */}
                            <MobilePayBar
                                selectedPlan={selectedPlan}
                                paymentPlans={paymentPlans}
                                currencySymbol={currencySymbol}
                                theme={theme}
                                submitDisabled={submitDisabled}
                                isSubmitting={isSubmitting}
                            />
                        </form>
                    </FormProvider>
                )}
            </div>
            {/* Load a vendor's client script only when it is the active
                payment method — next/script never removes an injected script,
                so an unconditional tag follows the visitor for the whole
                session. Stripe needs no client script at all (hosted
                Checkout via top-level redirect). */}
            {siteinfo.paymentMethod === UIConstants.PAYMENT_METHOD_RAZORPAY && (
                <Script src="https://checkout.razorpay.com/v1/checkout.js" />
            )}
            {siteinfo.paymentMethod ===
                UIConstants.PAYMENT_METHOD_LEMONSQUEEZY && (
                <Script
                    src="https://app.lemonsqueezy.com/js/lemon.js"
                    id="lemonsqueezy"
                />
            )}
        </div>
    );
}
