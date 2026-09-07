import { z } from "zod";
import { checkPermission } from "@courselit/utils";
import {
    UIConstants,
    type FeedbackMailboxSettings,
    type FeedbackMailboxView,
} from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import DomainModel from "@/models/Domain";
import { requireFeedbackAdmin } from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";
import { invalidateDomainCache } from "@/lib/domain-cache";

export const mailboxSettingsInput = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("off") }).strict(),
    z
        .object({
            kind: z.literal("enabled"),
            recipient: z
                .string()
                .trim()
                .email()
                .max(254)
                .refine((v) => !/[\s<>,;]/.test(v)),
            intervalMinutes: z.number().int().min(1).max(10080),
            approvedPrivateRecipient: z.literal(true),
        })
        .strict(),
]);

export function canConfigureMailbox(ctx: GQLContext) {
    return (
        !!ctx.user &&
        String(ctx.user.domain) === String(ctx.subdomain._id) &&
        checkPermission(ctx.user.permissions, [
            UIConstants.permissions.manageSettings,
        ])
    );
}

export async function mailboxSettingsView(
    ctx: GQLContext,
): Promise<FeedbackMailboxView> {
    requireFeedbackAdmin(ctx);
    const domain = await DomainModel.findById(ctx.subdomain._id).select(
        "email settings.feedbackMailbox",
    );
    requireCondition(domain, "not_found", "Site not found.", 404);
    return {
        settings: domain.settings?.feedbackMailbox || { kind: "off" },
        ownerEmail: domain.email,
        canConfigure: canConfigureMailbox(ctx),
    };
}

export async function saveMailboxSettings(raw: unknown, ctx: GQLContext) {
    requireFeedbackAdmin(ctx);
    requireCondition(
        canConfigureMailbox(ctx),
        "forbidden",
        "Settings permission is required to change private delivery.",
        403,
    );
    const input = mailboxSettingsInput.parse(raw);
    const settings: FeedbackMailboxSettings =
        input.kind === "off"
            ? { kind: "off" }
            : {
                  kind: "enabled",
                  recipient: input.recipient,
                  intervalMinutes: input.intervalMinutes,
                  approvedBy: ctx.user!.userId,
                  approvedAt: new Date().toISOString(),
              };
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        { $set: { "settings.feedbackMailbox": settings } },
    );
    invalidateDomainCache(ctx.subdomain.name);
    return mailboxSettingsView(ctx);
}
