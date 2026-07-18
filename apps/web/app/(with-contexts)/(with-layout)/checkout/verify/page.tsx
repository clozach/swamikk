"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { PaymentVerificationStatus } from "./payment-verification-status";
import { useSearchParams } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { AddressContext, ThemeContext } from "@components/contexts";
import { FetchBuilder } from "@courselit/utils";
import { InvoicesStatus } from "@courselit/common-models";
import { Button, Header2, Section, Text1 } from "@courselit/page-primitives";

export default function Page() {
    const params = useSearchParams();
    const id = params?.get("id");
    const [paymentStatus, setPaymentStatus] =
        useState<InvoicesStatus>("pending");
    const [loading, setLoading] = useState(false);
    const address = useContext(AddressContext);
    const { theme } = useContext(ThemeContext);

    const verifyPayment = async () => {
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
            if (response.status) {
                setPaymentStatus(response.status);
            }
        } catch (error) {
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        verifyPayment();
    }, []);

    return (
        <Section theme={theme.theme}>
            <div className="mx-auto flex max-w-md flex-col items-center justify-center space-y-6 pb-16 pt-20 text-center">
                {paymentStatus === "paid" ? (
                    <>
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                            <Check
                                className="h-8 w-8 text-secondary"
                                aria-hidden="true"
                            />
                        </span>
                        <Header2 theme={theme.theme}>You&apos;re in.</Header2>
                        <Text1
                            theme={theme.theme}
                            className="text-muted-foreground"
                        >
                            Your content is ready whenever you are.
                        </Text1>
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
                            status={paymentStatus}
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
