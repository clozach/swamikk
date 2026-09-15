import UserModel from "@/models/User";
import type GQLContext from "@/models/GQLContext";
import { UIConstants } from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";

/** Personal account fields belong to the member and current member managers. */
export function canReadMemberDetails(
    user: { userId?: string; domain?: unknown },
    ctx: GQLContext,
): boolean {
    if (!ctx.user || !user?.userId || !ctx.subdomain?._id) return false;
    const domain = String(ctx.subdomain._id);
    if (
        (user.domain && String(user.domain) !== domain) ||
        (ctx.user.domain && String(ctx.user.domain) !== domain)
    )
        return false;
    if (ctx.memberMimic)
        return (
            user.userId === ctx.memberMimic.subjectUserId &&
            ctx.user.userId === user.userId
        );
    return (
        ctx.user.userId === user.userId ||
        checkPermission(ctx.user.permissions || [], [
            UIConstants.permissions.manageUsers,
        ])
    );
}

/** Legacy public objects stay referenced until a separately verified migration. */
export async function isLegacyAvatarMedia(mediaId: string): Promise<boolean> {
    return !!(await UserModel.exists({ "avatar.mediaId": mediaId }));
}

/** Ignore signed-URL query strings: they do not change the protected object. */
export async function isPrivateImageUrl(
    value: string,
    origin: string,
): Promise<boolean> {
    const url = new URL(value, origin);
    if (
        url.origin === origin &&
        url.pathname.startsWith("/api/contact-preferences/photo")
    )
        return true;
    const canonical = url.origin + url.pathname;
    const escaped = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp("^" + escaped + "(?:[?#]|$)");
    return !!(await UserModel.exists({
        $or: [{ "avatar.file": match }, { "avatar.thumbnail": match }],
    }));
}
