import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import { resolveMemberReadContext } from "@/services/member-mimic/context";
import {
    exitMemberMimic,
    startMemberMimic,
} from "@/services/member-mimic/session";
import {
    MEMBER_MIMIC_COOKIE,
    MEMBER_MIMIC_COOKIE_MAX_AGE,
} from "@/services/member-mimic/constants";

export const dynamic = "force-dynamic";
const inputSchema = z
    .object({
        userId: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[a-zA-Z0-9_-]+$/),
        returnTo: z.string().max(1024).optional(),
    })
    .strict();

export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const ctx = await requestContext(req);
        const resolved = await resolveMemberReadContext(req.headers, ctx);
        return { mimic: resolved.view };
    });
}

export async function POST(req: NextRequest) {
    let token: string | undefined;
    const response = await apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "member-mimic-start", 12);
        const input = inputSchema.parse(await readBoundedJson(req, 2048));
        const result = await startMemberMimic(input, ctx, req.headers);
        token = result.token;
        return { mimic: result.view, redirectTo: "/dashboard/profile" };
    }, 201);
    if (!token) return response;
    const output = new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
    });
    output.cookies.set(MEMBER_MIMIC_COOKIE, token, {
        httpOnly: true,
        sameSite: "strict",
        secure:
            (req.headers.get("x-forwarded-proto") ||
                req.nextUrl.protocol.replace(":", "")) === "https",
        path: "/",
        maxAge: MEMBER_MIMIC_COOKIE_MAX_AGE,
    });
    return output;
}

export async function DELETE(req: NextRequest) {
    const response = await apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        return {
            redirectTo: await exitMemberMimic(
                req.headers,
                String(ctx.subdomain._id),
                ctx.user?.userId,
            ),
        };
    });
    if (!response.ok) return response;
    const output = new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
    });
    output.cookies.set(MEMBER_MIMIC_COOKIE, "", {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 0,
    });
    return output;
}
