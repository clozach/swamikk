import { randomUUID } from "crypto";
import User from "@/models/User";
import type GQLContext from "@/models/GQLContext";
import { UIConstants } from "@courselit/common-models";
import { requireOverviewActor } from "./guard";
import { loadOverview } from "./load";
import { paymentOverview } from "./payments";
import { checkPaidAccess } from "./access-check";
import { recordedAttention } from "./attention";
import { ATTENTION_LIMIT, diagnosticId } from "./records";
import type { AdminOverview, AttentionItem } from "./types";

export async function readAdminOverview(
    ctx: GQLContext,
    days: 7 | 30 = 7,
    now = new Date(),
): Promise<AdminOverview> {
    requireOverviewActor(ctx);
    const domain = String(ctx.subdomain._id);
    const from = new Date(now.getTime() - days * 86400000);
    const records = await loadOverview(ctx.subdomain._id, from);
    const accessCheck = await checkPaidAccess(records, domain, now);
    const combined = [
        ...accessCheck.attention,
        ...recordedAttention(records, domain, now),
    ];
    const unique = Array.from(
        new Map(combined.map((item) => [item.diagnosticId, item])).values(),
    );
    // Put inferred missed access first; all other items retain oldest-record-first inspection order.
    unique.sort(
        (a, b) =>
            Number(a.kind !== "paid-access-review") -
                Number(b.kind !== "paid-access-review") ||
            (a.recordedAt || "").localeCompare(b.recordedAt || ""),
    );
    const selected = unique.slice(0, ATTENTION_LIMIT);
    let linkedUsers = new Set<string>();
    if (ctx.user.permissions.includes(UIConstants.permissions.manageUsers)) {
        try {
            const users = await User.find({
                domain: ctx.subdomain._id,
                active: true,
                userId: {
                    $in: selected.flatMap((item) =>
                        item.subject ? [item.subject] : [],
                    ),
                },
            })
                .select("userId")
                .lean();
            linkedUsers = new Set(users.map((user) => user.userId));
        } catch {
            accessCheck.checks.unavailable = true;
        }
    }
    const attention: AttentionItem[] = selected.map(({ subject, ...item }) => ({
        ...item,
        ...(subject
            ? {
                  member: {
                      label: `Member ${diagnosticId(domain, "member", subject).slice(0, 8)}`,
                      ...(linkedUsers.has(subject) ? { userId: subject } : {}),
                  },
              }
            : {}),
    }));
    return {
        snapshotId: randomUUID(),
        generatedAt: now.toISOString(),
        periodStart: from.toISOString(),
        days,
        ...paymentOverview(records, from, now),
        membershipRecords:
            records.memberships.coverage.state === "available"
                ? {
                      active: records.memberships.rows.filter(
                          (item) => item.status === "active",
                      ).length,
                      pending: records.memberships.rows.filter(
                          (item) => item.status === "pending",
                      ).length,
                      other: records.memberships.rows.filter(
                          (item) =>
                              !["active", "pending"].includes(item.status),
                      ).length,
                  }
                : null,
        accessRecords:
            records.access.coverage.state === "available"
                ? {
                      active: records.access.rows.filter(
                          (item) => item.state.kind === "active",
                      ).length,
                      processing: records.access.rows.filter((item) =>
                          ["freezing", "prepared"].includes(item.state.kind),
                      ).length,
                      ended: records.access.rows.filter(
                          (item) => item.state.kind === "ended",
                      ).length,
                  }
                : null,
        publishedProducts: records.products.count,
        attention,
        attentionTotal: unique.length,
        attentionLimited: unique.length > ATTENTION_LIMIT,
        paidAccessChecks: accessCheck.checks,
        sources: Object.values(records).map((item) => item.coverage),
    };
}
