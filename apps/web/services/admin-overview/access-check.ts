import { getMemberCourseReadScope } from "../../../../packages/common-logic/src/member-access/read";
import type { OverviewRecords } from "./load";
import type { AdminOverview } from "./types";
import { ACCESS_CHECK_LIMIT, ATTENTION_AFTER_MS, date } from "./records";
import { attentionRecord, type PendingAttention } from "./attention";

/** A receipt is a prompt to inspect access, never an instruction to grant it. */
export async function checkPaidAccess(
    records: OverviewRecords,
    domain: string,
    now: Date,
) {
    const attention: PendingAttention[] = [];
    const checks: AdminOverview["paidAccessChecks"] = {
        checked: 0,
        limited: false,
        unavailable: false,
    };
    if (
        [
            records.payments,
            records.memberships,
            records.access,
            records.subscriptions,
            records.cancellations,
        ].some(
            (source) =>
                source.coverage.state === "unavailable" ||
                source.coverage.limited,
        )
    ) {
        checks.unavailable = true;
        return { attention, checks };
    }
    const visited = new Set<string>();
    let attempted = 0;
    for (const invoice of records.payments.rows) {
        const settled = date(invoice.settlement?.at);
        if (!settled || now.getTime() - settled.getTime() < ATTENTION_AFTER_MS)
            continue;
        const member = records.memberships.rows.find(
            (item) =>
                item.membershipId === invoice.membershipId &&
                item.sessionId === invoice.membershipSessionId,
        );
        // Historic sessions, deliberate endings and collection failures are not missed activations.
        if (!member || !["active", "pending"].includes(member.status)) continue;
        const periods = records.access.rows.filter(
            (item) =>
                item.membershipId === member.membershipId &&
                item.membershipSessionId === member.sessionId,
        );
        const ended =
            periods.some((item) => item.state.kind !== "active") ||
            records.subscriptions.rows.some(
                (item) =>
                    item.membershipSessionId === member.sessionId &&
                    (item.membershipId === member.membershipId ||
                        item.includedMembershipIds?.includes(
                            member.membershipId,
                        )) &&
                    item.state.kind !== "observed",
            ) ||
            records.cancellations.rows.some(
                (item) =>
                    item.membershipId === member.membershipId &&
                    item.membershipSessionId === member.sessionId &&
                    item.cancellation.kind !== "quoted",
            );
        const key = `${member.userId}:${member.entityId}`;
        if (ended || visited.has(key)) continue;
        visited.add(key);
        if (attempted >= ACCESS_CHECK_LIMIT) {
            checks.limited = true;
            continue;
        }
        attempted++;
        try {
            const scope = await getMemberCourseReadScope({
                domainId: domain,
                userId: member.userId,
                courseId: member.entityId,
            });
            checks.checked++;
            if (
                scope.kind === "none" ||
                (scope.kind === "restricted" &&
                    !scope.processing &&
                    member.status === "pending")
            )
                attention.push(
                    attentionRecord(
                        domain,
                        "payments",
                        invoice.invoiceId,
                        "paid-access-review",
                        "needs checking",
                        invoice.settlement?.at,
                        "/dashboard/transactions",
                        member.userId,
                        invoice.paymentMode || "unknown",
                    ),
                );
        } catch {
            checks.unavailable = true;
        }
    }
    return { attention, checks };
}
