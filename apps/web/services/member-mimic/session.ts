import { createHash, randomBytes, randomUUID } from "crypto";
import type {
    MemberMimicInput,
    MemberMimicStartResult,
    MemberMimicView,
} from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";
import { UIConstants } from "@courselit/common-models";
import { auth } from "@/auth";
import UserModel from "@/models/User";
import type GQLContext from "@/models/GQLContext";
import { requireCondition } from "@/services/content-changes/errors";
import { MemberMimicModel } from "./model";
import {
    MEMBER_MIMIC_AUDIT_MS,
    MEMBER_MIMIC_DURATION_MS,
    readMemberMimicToken,
    safeMimicReturnTo,
} from "./constants";

export const mimicHash = (value: string) =>
    createHash("sha256").update(value).digest("hex");

export function canStartMemberMimic(ctx: GQLContext): boolean {
    return (
        !!ctx.user &&
        String(ctx.user.domain) === String(ctx.subdomain._id) &&
        checkPermission(ctx.user.permissions, [
            UIConstants.permissions.manageUsers,
        ])
    );
}

export async function actorSessionHash(
    headers: Headers,
    ctx: GQLContext,
): Promise<string | undefined> {
    const session = await auth.api.getSession({ headers });
    return session?.session?.id &&
        ctx.user &&
        session.user.email === ctx.user.email
        ? mimicHash(session.session.id)
        : undefined;
}

export async function startMemberMimic(
    input: MemberMimicInput,
    ctx: GQLContext,
    headers: Headers,
): Promise<MemberMimicStartResult> {
    requireCondition(
        canStartMemberMimic(ctx),
        "forbidden",
        "Member management permission is required.",
        403,
    );
    const sessionHash = await actorSessionHash(headers, ctx);
    requireCondition(
        sessionHash,
        "forbidden",
        "Sign in again before opening Member Mimic.",
        403,
    );
    const subject = await UserModel.findOne({
        domain: ctx.subdomain._id,
        userId: input.userId,
        active: true,
    });
    requireCondition(
        subject,
        "not_found",
        "This member is unavailable or cannot currently sign in.",
        404,
    );
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MEMBER_MIMIC_DURATION_MS);
    const returnTo = safeMimicReturnTo(input.returnTo);
    await MemberMimicModel.init();
    await MemberMimicModel.updateMany(
        {
            domain: ctx.subdomain._id,
            actorSessionHash: sessionHash,
            "state.kind": "active",
        },
        {
            $set: {
                state: {
                    kind: "revoked",
                    at: now.toISOString(),
                    by: ctx.user.userId,
                },
            },
            $unset: { activeSessionKey: 1 },
        },
    );
    await MemberMimicModel.create({
        domain: ctx.subdomain._id,
        id: randomUUID(),
        tokenHash: mimicHash(token),
        actorUserId: ctx.user.userId,
        actorSessionHash: sessionHash,
        subjectUserId: subject.userId,
        returnTo,
        state: { kind: "active" },
        activeSessionKey: sessionHash,
        createdAt: now,
        expiresAt,
        deleteAfter: new Date(now.getTime() + MEMBER_MIMIC_AUDIT_MS),
    });
    return {
        token,
        view: {
            kind: "active",
            subject: {
                userId: subject.userId,
                name: subject.name || subject.email,
                email: subject.email,
            },
            actor: {
                userId: ctx.user.userId,
                name: ctx.user.name || ctx.user.email,
                email: ctx.user.email,
            },
            expiresAt: expiresAt.toISOString(),
            returnTo,
        },
    };
}

export async function exitMemberMimic(
    headers: Headers,
    domainId: string,
    actorUserId?: string,
): Promise<string> {
    const token = readMemberMimicToken(headers);
    if (!token) return "/dashboard/users";
    const record = await MemberMimicModel.findOneAndUpdate(
        { domain: domainId, tokenHash: mimicHash(token) },
        {
            $set: {
                state: {
                    kind: "revoked",
                    at: new Date().toISOString(),
                    by: actorUserId || "expired-session",
                },
            },
            $unset: { activeSessionKey: 1 },
        },
        { new: true },
    );
    return safeMimicReturnTo(record?.returnTo);
}

export function expiredMimicView(
    returnTo?: string,
): Extract<MemberMimicView, { kind: "expired" }> {
    return { kind: "expired", returnTo: safeMimicReturnTo(returnTo) };
}
