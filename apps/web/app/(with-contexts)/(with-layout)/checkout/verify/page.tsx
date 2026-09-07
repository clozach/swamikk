"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import type { ClassCheckoutStatus } from "@/services/class-checkout/status";
import { PaymentVerificationStatus } from "./payment-verification-status";
import { useSearchParams } from "next/navigation";
import {
    Suspense,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { AddressContext, ThemeContext } from "@components/contexts";
import { FetchBuilder } from "@courselit/utils";
import { InvoicesStatus } from "@courselit/common-models";
import { Button, Header2, Section, Text1 } from "@courselit/page-primitives";

function VerifyContent() {
    const params = useSearchParams();
    const id = params?.get("id");
    const [paymentStatus, setPaymentStatus] =
        useState<InvoicesStatus>("pending");
    const [purchasedEntityId, setPurchasedEntityId] = useState<string | null>(
        null,
    );
    const [classBooking, setClassBooking] = useState<ClassCheckoutStatus>({
        kind: "none",
    });
    const requestSequence = useRef(0);
    const [responseId, setResponseId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const address = useContext(AddressContext);
    const { theme } = useContext(ThemeContext);

    const verifyPayment = useCallback(async () => {
        const sequence = ++requestSequence.current;
        setPaymentStatus("pending"); // Hide check status again
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/payment/verify-new`)
            .setHeaders({
                "Content-Type": "application/json",
            })
            .setPayload(JSON.stringify({ id }))
            .build();

        try {
            setLoading(true);
            const response = await fetch.exec();
            if (sequence !== requestSequence.current) return;
            setResponseId(id || null);
            setClassBooking(response.classBooking || { kind: "none" });
            if (response.status) {
                setPaymentStatus(response.status);
            }
            if (typeof response.entityId === "string") {
                setPurchasedEntityId(response.entityId);
            }
        } catch (error) {
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    }, [id, address.backend]);

    const invalidatePendingRequest = useCallback(() => {
        requestSequence.current++;
    }, []);
    useEffect(() => {
        verifyPayment();
        return invalidatePendingRequest;
    }, [verifyPayment, invalidatePendingRequest]);

    return (
        <Section theme={theme.theme}>
            <div className="mx-auto flex max-w-md flex-col items-center justify-center space-y-6 pb-16 pt-20 text-center">
                {paymentStatus === "paid" && responseId === id ? (
                    <>
                        {/* data-journey="purchase-verified": the Journey Card's
                            ONLY Stripe-return detector. It must stay on this
                            paid-only branch — failed/pending render at the same
                            URL, so a URL detector would lie. data-journey-product
                            carries WHICH product this paid page proves; the
                            card's detectors pin on it so another product's paid
                            page can never satisfy this journey. If this page is
                            redesigned, keep a paid-only element carrying both
                            attributes (see journey-card/journeys.ts inventory). */}
                        <span
                            data-journey="purchase-verified"
                            data-journey-product={
                                purchasedEntityId ?? undefined
                            }
                            className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"
                        >
                            <Check
                                className="h-8 w-8 text-secondary"
                                aria-hidden="true"
                            />
                        </span>
                        <Header2 theme={theme.theme}>
                            {classBooking.kind === "paid-review"
                                ? "Payment recorded. Your class needs review."
                                : classBooking.kind === "completed"
                                  ? "Your class booking is confirmed."
                                  : "You're in."}
                        </Header2>
                        <Text1
                            theme={theme.theme}
                            className="text-muted-foreground"
                        >
                            {classBooking.kind === "paid-review"
                                ? `${classBooking.membership === "active" ? "Your product membership is active." : "Your product membership still needs confirmation."} Your place on the class roster has not been confirmed. Please contact us before paying again.`
                                : "Your content is ready whenever you are."}
                        </Text1>
                        {(classBooking.kind === "paid-review" ||
                            classBooking.kind === "completed") && (
                            <p>
                                Selected date:{" "}
                                {new Date(
                                    classBooking.selectedStart,
                                ).toLocaleString("en-NZ", {
                                    timeZone: "UTC",
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                })}{" "}
                                UTC
                            </p>
                        )}
                        {classBooking.kind === "paid-review" && (
                            <Link href="/p/contact" className="underline">
                                Get booking help
                            </Link>
                        )}
                        {id && (
                            <Text1
                                theme={theme.theme}
                                className="text-muted-foreground"
                            >
                                Order reference:{" "}
                                <span className="font-medium text-foreground">
                                    {id}
                                </span>
                            </Text1>
                        )}
                        <Button theme={theme.theme} asChild>
                            <Link href="/dashboard/my-content">
                                Go to my content
                            </Link>
                        </Button>
                        {id && (
                            <Link
                                href={`/dashboard/receipts/${encodeURIComponent(id)}`}
                                className="rounded-sm px-4 py-3 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                            >
                                View receipt
                            </Link>
                        )}
                    </>
                ) : (
                    <>
                        <Header2 theme={theme.theme}>
                            Thank you for your order
                        </Header2>
                        {id && (
                            <Text1
                                theme={theme.theme}
                                className="text-muted-foreground"
                            >
                                Order reference:{" "}
                                <span className="font-medium text-foreground">
                                    {id}
                                </span>
                            </Text1>
                        )}
                        <PaymentVerificationStatus
                            status={
                                responseId === id ? paymentStatus : "pending"
                            }
                            onRetryVerification={verifyPayment}
                            loading={loading}
                            theme={theme.theme}
                        />
                    </>
                )}
            </div>
        </Section>
    );
}

// useSearchParams() must sit under a Suspense boundary, otherwise Next.js
// deopts the whole /checkout/verify route into client-side rendering — which
// showed up as a blank page (dev) / a hard bounce to the home page (prod build)
// the moment a real Stripe return landed here.
export default function Page() {
    return (
        <Suspense fallback={null}>
            <VerifyContent />
        </Suspense>
    );
}
