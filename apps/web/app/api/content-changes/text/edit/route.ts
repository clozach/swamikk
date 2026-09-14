import type { NextRequest } from "next/server";
import { z } from "zod";
import {
    apiResponse,
    requestContext,
    requireSameOrigin,
    readBoundedJson,
    limitRequest,
} from "@/services/content-changes/http";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import { applyTextEdit } from "@/services/content-changes/text-edit";
import { MAX_TEXT } from "@/services/content-changes/text-leaves";

export const dynamic = "force-dynamic";
const id = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/);
const path = z
    .string()
    .min(1)
    .max(300)
    .regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,23}$/);
const text = z.string().max(MAX_TEXT);
const node = z.object({ type: z.string().min(1).max(40) }).passthrough();
const change = z.discriminatedUnion("kind", [
    z
        .object({ kind: z.literal("text"), path, before: text, after: text })
        .strict(),
    z
        .object({ kind: z.literal("node"), path, before: node, after: node })
        .strict(),
]);
const input = z
    .object({
        target: z.discriminatedUnion("kind", [
            z
                .object({
                    kind: z.literal("page-widget-text"),
                    pageId: id,
                    widgetId: id,
                })
                .strict(),
            z
                .object({
                    kind: z.literal("shared-widget-text"),
                    pageId: id,
                    name: z
                        .string()
                        .min(1)
                        .max(80)
                        .regex(/^[a-zA-Z0-9_-]+$/),
                })
                .strict(),
        ]),
        changes: z.array(change).min(1).max(8),
        undoOf: z.string().uuid().optional(),
    })
    .strict();

/**
 * One inline text edit: every change on one widget, applied together. Each
 * change's `before` must be the exact stored value (string leaf) or node; a
 * mismatch answers 409 with the current values so the editor can resync
 * instead of overwriting someone else's change.
 */
export async function POST(req: NextRequest) {
    let staleBody: unknown;
    const response = await apiResponse(async () => {
        requireSameOrigin(req);
        assertNoMemberMimicMutation(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "text-edit", 120);
        const body = input.parse(await readBoundedJson(req));
        const result = await applyTextEdit(body, ctx);
        if (result.kind === "stale")
            staleBody = {
                error: { code: "stale", message: result.message },
                current: result.current,
            };
        return result;
    });
    if (staleBody)
        return Response.json(staleBody, {
            status: 409,
            headers: { "Cache-Control": "no-store" },
        });
    return response;
}
