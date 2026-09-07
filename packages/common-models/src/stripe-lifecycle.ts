/** Exact local cancellation evidence; never a license to round a new release timestamp. */
export interface NativeSubscriptionEndProof {
    operationId: string;
    cutoff: Date;
    targets: Array<{ membershipId: string; courseId: string }>;
}

export interface ProviderEndBoundary {
    cutoff: Date;
    nativeCancellation?: NativeSubscriptionEndProof;
}

/** Financial correlation only. Never contains an email, payment method, or webhook body. */
export interface StripeSubscriptionBinding {
    subscriptionId: string;
    mode: "test" | "live";
    membershipId: string;
    membershipSessionId: string;
    userId: string;
    paymentPlanId: string;
    planType: string;
    originalInvoiceId: string;
    customerId: string;
    includedMembershipIds: string[];
    state:
        | { kind: "observed"; status: string; cancelAtPeriodEnd: boolean }
        | ({ kind: "ending"; operationId: string } & ProviderEndBoundary)
        | {
              kind: "ended";
              cutoff: Date;
              operationId: string;
              unknownReleaseCount: number;
              nativeCancellation?: NativeSubscriptionEndProof;
          };
    /** No automatic expiry: an old worker must not keep writing after a takeover. */
    claim?: { id: string; eventId: string; startedAt: Date };
    revision: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface StripeWebhookReceipt {
    eventId: string;
    type: string;
    objectId: string;
    mode: "test" | "live";
    state:
        | { kind: "received" }
        | { kind: "complete"; outcome: string }
        | { kind: "review-required"; reason: string }
        | { kind: "retry"; reason: string };
    createdAt: Date;
    updatedAt: Date;
}

export interface SubscriptionAccessSubject {
    domainId: string;
    userId: string;
    membershipId: string;
    sessionId: string;
    paymentPlanId?: string;
    isIncludedInPlan?: boolean;
}

export interface IncludedMembershipIdentity {
    domainId: string;
    userId: string;
    courseId: string;
    paymentPlanId: string;
    sessionId: string;
}
