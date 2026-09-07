import type GQLContext from "@/models/GQLContext";
import { UIConstants } from "@courselit/common-models";
import { requireCondition } from "../content-changes/errors";
import { hasMemberMimicCookie } from "../member-mimic/constants";

export function requireOverviewActor(ctx: GQLContext, headers?: Headers) {
    requireCondition(
        ctx.user?.active &&
            String(ctx.user.domain) === String(ctx.subdomain._id) &&
            !ctx.memberMimic &&
            (!headers || !hasMemberMimicCookie(headers)) &&
            ctx.user.permissions.includes(
                UIConstants.permissions.manageSettings,
            ),
        "forbidden",
        "Site settings permission is required. Exit Member Mimic to open this view.",
        403,
    );
}
