import type { ReactNode } from "react";
import { ProfileContext } from "@/components/contexts";
import { MemberMimicContext } from "@/components/member-mimic/context";
import type { AdminOverview } from "@/services/admin-overview/types";
import type { DiagnosticSource } from "@/services/admin-overview/types";

export const sources: DiagnosticSource[] = [
    "payments",
    "memberships",
    "access",
    "subscriptions",
    "refunds",
    "cancellations",
    "refund-requests",
    "webhooks",
    "content-changes",
    "release-changes",
    "feedback-mail",
    "products",
];
export const snapshot: AdminOverview = {
    snapshotId: "snapshot-one",
    generatedAt: "2026-09-07T12:00:00Z",
    periodStart: "2026-08-31T12:00:00Z",
    days: 7,
    payments: [
        {
            mode: "test",
            currency: "NZD",
            paid: 9,
            receipts: 1,
            observedRefunds: 9,
            refundEvidenceCount: 1,
            refundsCheckedAt: "2026-09-07T11:55:00Z",
        },
        {
            mode: "live",
            currency: "USD",
            paid: 20,
            receipts: 1,
            observedRefunds: 0,
            refundEvidenceCount: 0,
            refundsCheckedAt: null,
        },
    ],
    undatedPaidReceipts: 1,
    membershipRecords: { active: 3, pending: 1, other: 2 },
    accessRecords: { active: 2, processing: 1, ended: 1 },
    publishedProducts: 5,
    attention: [],
    attentionTotal: 0,
    attentionLimited: false,
    paidAccessChecks: { checked: 1, limited: false, unavailable: false },
    sources: sources.map((source) => ({
        source,
        state: "available",
        loaded: 1,
        limited: false,
        latestRecordAt: "2026-09-07T11:00:00Z",
    })),
};
export const allPermissions = [
    "setting:manage",
    "user:manage",
    "course:manage_any",
    "site:manage",
];
export function Actors({
    children,
    permissions = allPermissions,
    userId = "admin",
    kind = "inactive",
}: {
    children: ReactNode;
    permissions?: string[];
    userId?: string;
    kind?: "inactive" | "expired";
}) {
    return (
        <ProfileContext.Provider
            value={{ profile: { userId, permissions } } as any}
        >
            <MemberMimicContext.Provider value={{ kind } as any}>
                {children}
            </MemberMimicContext.Provider>
        </ProfileContext.Provider>
    );
}
