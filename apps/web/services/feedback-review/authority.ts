import { randomUUID } from "crypto";
import type { InternalFeedbackReviewGrant } from "@courselit/orm-models";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { requireCondition } from "../content-changes/errors";
import { consumeRateLimit } from "../content-changes/rate-limit";
import { ReviewGrantModel } from "./models";
import { hashToken, requireIssuer, settleRevocation } from "./grants";
export interface ReviewerAuthority {
    domainId: string;
    grant: InternalFeedbackReviewGrant;
}
/** No session lookup or administrator role mapping. Only this dedicated credential works. */
export async function withReviewer<T>(
    domainId: string,
    token: string,
    purpose: string,
    operation: (authority: ReviewerAuthority) => Promise<T>,
): Promise<T> {
    const match = /^fbr_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
    requireCondition(
        match,
        "unauthorized",
        "A valid restricted review grant is required.",
        401,
    );
    const filter = {
        domain: domainId,
        id: match[1],
        tokenHash: hashToken(token),
        "state.kind": "active",
        expiresAt: { $gt: new Date() },
    };
    const grant = await ReviewGrantModel.findOne(filter);
    requireCondition(
        grant,
        "unauthorized",
        "A valid restricted review grant is required.",
        401,
    );
    await consumeRateLimit(
        `feedback-review:${domainId}:${grant.id}`,
        60,
        60_000,
    );
    return withAccountWrite(
        {
            domainId,
            userId: grant.issuerUserId,
            purpose: "restricted-feedback-review",
        },
        async () => {
            await requireIssuer(domainId, grant.issuerUserId, grant.scopes);
            const id = randomUUID();
            const reserved = await ReviewGrantModel.updateOne(
                { ...filter, expiresAt: { $gt: new Date() } },
                {
                    $push: {
                        operations: { id, purpose, startedAt: new Date() },
                    },
                },
            );
            requireCondition(
                reserved.modifiedCount === 1,
                "unauthorized",
                "This review grant stopped accepting requests.",
                401,
            );
            try {
                // A concurrent revocation waits for this admitted operation; it never claims
                // to recall a context already returned or an accepted result already committed.
                await requireIssuer(domainId, grant.issuerUserId, grant.scopes);
                return await operation({ domainId, grant });
            } finally {
                await ReviewGrantModel.updateOne(
                    { domain: domainId, id: grant.id, "operations.id": id },
                    { $pull: { operations: { id } } },
                );
                await settleRevocation(domainId, grant.id);
            }
        },
    );
}
