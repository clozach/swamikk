import { projectMemberPurchases } from "@/services/member-access/projection";
import type { InternalUser } from "@courselit/orm-models";
import type { MemberMimicResolution } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import UserModel from "@/models/User";
import { requireCondition } from "@/services/content-changes/errors";
import { hasMemberMimicCookie, readMemberMimicToken } from "./constants";
import {
    actorSessionHash,
    canStartMemberMimic,
    expiredMimicView,
    mimicHash,
} from "./session";
import { MemberMimicModel } from "./model";

/** Access facts are retained. Personal activity, secrets and administrative powers are omitted. */
export function projectMimicSubject(subject: InternalUser): InternalUser {
    return {
        _id: subject._id,
        id: String(subject._id),
        domain: subject.domain,
        userId: subject.userId,
        name: subject.name,
        email: subject.email,
        bio: subject.bio,
        avatar: subject.avatar,
        active: subject.active,
        subscribedToUpdates: subject.subscribedToUpdates,
        permissions: [],
        purchases: (subject.purchases || []).map((purchase) => ({
            courseId: purchase.courseId,
            createdAt: purchase.createdAt,
            lastDripAt: purchase.lastDripAt,
            accessibleGroups: [...(purchase.accessibleGroups || [])],
            completedLessons: [],
        })),
    } as unknown as InternalUser;
}

export async function resolveMemberReadContext(
    headers: Headers,
    ctx: GQLContext,
): Promise<MemberMimicResolution<GQLContext>> {
    if (!hasMemberMimicCookie(headers))
        return { kind: "ordinary", context: ctx, view: { kind: "inactive" } };
    const token = readMemberMimicToken(headers);
    if (!token || !canStartMemberMimic(ctx))
        return { kind: "expired", view: expiredMimicView() };
    const sessionHash = await actorSessionHash(headers, ctx);
    if (!sessionHash) return { kind: "expired", view: expiredMimicView() };
    const record = await MemberMimicModel.findOne({
        domain: ctx.subdomain._id,
        tokenHash: mimicHash(token),
        actorUserId: ctx.user.userId,
        actorSessionHash: sessionHash,
    });
    if (
        !record ||
        record.state.kind !== "active" ||
        record.expiresAt.getTime() <= Date.now()
    )
        return { kind: "expired", view: expiredMimicView(record?.returnTo) };
    const subject = await UserModel.findOne({
        domain: ctx.subdomain._id,
        userId: record.subjectUserId,
        active: true,
    });
    if (!subject)
        return { kind: "expired", view: expiredMimicView(record.returnTo) };
    const projected = projectMimicSubject(subject);
    projected.purchases = await projectMemberPurchases(
        String(ctx.subdomain._id),
        projected,
    );
    return {
        kind: "mimic",
        context: {
            ...ctx,
            actor: ctx.user,
            user: projected,
            memberMimic: {
                id: record.id,
                actorUserId: ctx.user.userId,
                subjectUserId: subject.userId,
                expiresAt: record.expiresAt.toISOString(),
            },
        } as GQLContext,
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
            expiresAt: record.expiresAt.toISOString(),
            returnTo: record.returnTo,
        },
    };
}

export function assertNoMemberMimicMutation(headers: Headers) {
    requireCondition(
        !hasMemberMimicCookie(headers),
        "mimic_read_only",
        "Exit Member Mimic before making changes.",
        403,
    );
}
