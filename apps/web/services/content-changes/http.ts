import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import type GQLContext from "@/models/GQLContext";
import { checkPermission } from "@courselit/utils";
import { UIConstants } from "@courselit/common-models";
import { ContentChangeError, requireCondition } from "./errors";
import { consumeRateLimit } from "./rate-limit";

export function isFeedbackAdmin(ctx: GQLContext): boolean {
    return (
        !!ctx.user &&
        String(ctx.user.domain) === String(ctx.subdomain._id) &&
        checkPermission(ctx.user.permissions, [
            UIConstants.permissions.manageSite,
            UIConstants.permissions.manageAnyCourse,
        ])
    );
}

export function requireFeedbackAdmin(ctx: GQLContext) {
    requireCondition(
        isFeedbackAdmin(ctx),
        "forbidden",
        "Administrator access is required.",
        403,
    );
}

export async function requestContext(req: NextRequest): Promise<GQLContext> {
    const domain = await DomainModel.findOne({
        name: req.headers.get("domain"),
    });
    requireCondition(domain, "not_found", "Site not found.", 404);
    const session = await auth.api.getSession({ headers: req.headers });
    const user = session?.user?.email
        ? await UserModel.findOne({
              domain: domain._id,
              email: session.user.email,
              active: true,
          })
        : null;
    return {
        subdomain: domain,
        user: user || undefined,
        address: new URL(req.url).origin,
    } as GQLContext;
}

export function requireSameOrigin(req: NextRequest) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host") || new URL(req.url).host;
    const protocol =
        req.headers.get("x-forwarded-proto") ||
        new URL(req.url).protocol.replace(":", "");
    requireCondition(
        origin === `${protocol}://${host}` &&
            req.headers.get("sec-fetch-site") !== "cross-site",
        "forbidden",
        "Submit changes from this site.",
        403,
    );
    requireCondition(
        req.headers.get("content-type")?.split(";")[0].trim() ===
            "application/json",
        "bad_request",
        "Send a JSON request.",
        415,
    );
}

export async function readBoundedJson(
    req: NextRequest,
    maximum = 128 * 1024,
): Promise<unknown> {
    requireCondition(
        Number(req.headers.get("content-length") || 0) <= maximum,
        "too_large",
        "Request is too large.",
        413,
    );
    const reader = req.body?.getReader();
    requireCondition(reader, "bad_request", "Request body is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > maximum) {
            await reader.cancel();
            throw new ContentChangeError(
                "too_large",
                "Request is too large.",
                413,
            );
        }
        chunks.push(result.value);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new ContentChangeError(
            "bad_request",
            "Request contains invalid JSON.",
        );
    }
}

export async function limitRequest(
    req: NextRequest,
    ctx: GQLContext,
    action: string,
    limit = 30,
) {
    // Reverse proxy supplies the last client hop. No raw IP is retained in the database.
    const ip =
        req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
        "unknown";
    await consumeRateLimit(
        `${ctx.subdomain._id}:${action}:${ctx.user?.userId || ip}`,
        limit,
        60_000,
    );
}

export async function apiResponse(
    operation: () => Promise<unknown>,
    status = 200,
): Promise<Response> {
    try {
        return Response.json(await operation(), {
            status,
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        if (error instanceof ZodError)
            return Response.json(
                {
                    error: {
                        code: "bad_request",
                        message: error.issues[0]?.message || "Invalid request.",
                    },
                },
                { status: 400 },
            );
        if (error instanceof ContentChangeError)
            return Response.json(
                { error: { code: error.code, message: error.message } },
                { status: error.status },
            );
        // Never expose database details, feedback text or provider credentials in errors.
        return Response.json(
            {
                error: {
                    code: "unavailable",
                    message:
                        "The request could not be completed. Refresh its status before retrying.",
                },
            },
            { status: 503 },
        );
    }
}
