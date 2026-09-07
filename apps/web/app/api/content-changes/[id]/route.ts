import { preparePublicationReview } from "@/services/content-changes/page-publication-adapter";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import type { NextRequest } from "next/server";
import type { ContentChangeRouteParams } from "@courselit/common-models";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import {
    changeView,
    getChange,
    prepareRevert,
    rejectChange,
    reviseChange,
} from "@/services/content-changes/proposals";
import {
    approveChange,
    reconcileChange,
} from "@/services/content-changes/application";
import { contentChangeActionSchema } from "@/services/content-changes/validation";
import { deleteChange } from "@/services/content-changes/cleanup";

export const dynamic = "force-dynamic";

export async function GET(
    req: NextRequest,
    { params }: ContentChangeRouteParams,
) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "content-change-read", 120);
        return { change: changeView(await getChange((await params).id, ctx)) };
    });
}

export async function POST(
    req: NextRequest,
    { params }: ContentChangeRouteParams,
) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "content-change-action");
        const body = contentChangeActionSchema.parse(
            await readBoundedJson(req),
        );
        const { id } = await params;
        switch (body.action) {
            case "prepare-publication":
                return {
                    change: await preparePublicationReview(
                        id,
                        body.version,
                        ctx,
                    ),
                };
            case "approve":
                return {
                    change: await approveChange(
                        id,
                        body.version,
                        body.previewHash,
                        ctx,
                    ),
                };
            case "revise":
                return {
                    change: await reviseChange(
                        id,
                        body.version,
                        body.patch,
                        body.summary,
                        ctx,
                    ),
                };
            case "reject":
                return { change: await rejectChange(id, body.version, ctx) };
            case "reconcile":
                return { change: await reconcileChange(id, ctx) };
            case "revert":
                return { change: await prepareRevert(id, body.version, ctx) };
        }
    });
}

export async function DELETE(
    req: NextRequest,
    { params }: ContentChangeRouteParams,
) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "content-change-delete");
        return deleteChange((await params).id, ctx);
    });
}
