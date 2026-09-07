import mongoose from "mongoose";
import UserModel from "@/models/User";
import { AccountLifecycleModel } from "../../../../packages/common-logic/src/account-lifecycle/model";
import type { InternalFeedback } from "@courselit/orm-models";
import { FeedbackModel } from "../content-changes/models";
import { AccountLifecycleError } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import type { ReviewerAuthority } from "./authority";
import {
    claimNew,
    eligibleFeedback,
    liveAuthority,
    withFeedbackAccount,
} from "./leases";
import { finishReviewIntent } from "./results";
export async function claimReview(authority: ReviewerAuthority) {
    await liveAuthority(authority);
    const records = await FeedbackModel.aggregate<InternalFeedback>([
        {
            $match: {
                ...eligibleFeedback(authority.domainId),
                state: { $in: ["open", "closed"] },
                domain: new mongoose.Types.ObjectId(authority.domainId),
                "target.kind": {
                    $in: authority.grant.scopes.map((scope) =>
                        scope === "public-page-text" ? "page" : "lesson",
                    ),
                },
                $or: [
                    { automaticReview: { $exists: false }, state: "open" },
                    {
                        state: "open",
                        "automaticReview.kind": "leased",
                        "automaticReview.leaseUntil": {
                            $lte: new Date().toISOString(),
                        },
                    },
                    { "automaticReview.kind": "submitting" },
                ],
            },
        },
        { $sort: { createdAt: 1, id: 1 } },
        // Filter unavailable authors before the bounded candidate window, so an old
        // closing/deactivated account cannot starve later visitor/member feedback.
        {
            $lookup: {
                from: UserModel.collection.name,
                let: { userId: "$actor.userId", domain: "$domain" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$domain", "$$domain"] },
                                    { $eq: ["$userId", "$$userId"] },
                                    { $eq: ["$active", true] },
                                ],
                            },
                        },
                    },
                    { $limit: 1 },
                    { $project: { _id: 1 } },
                ],
                as: "reviewAuthor",
            },
        },
        {
            $lookup: {
                from: AccountLifecycleModel.collection.name,
                let: { userId: "$actor.userId", domain: "$domain" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$domain", "$$domain"] },
                                    { $eq: ["$userId", "$$userId"] },
                                    { $ne: ["$state", "active"] },
                                ],
                            },
                        },
                    },
                    { $limit: 1 },
                    { $project: { _id: 1 } },
                ],
                as: "reviewClosedAuthor",
            },
        },
        {
            $match: {
                $or: [
                    { "actor.kind": "visitor" },
                    {
                        "reviewAuthor.0": { $exists: true },
                        "reviewClosedAuthor.0": { $exists: false },
                    },
                ],
            },
        },
        { $limit: 20 },
        { $project: { reviewAuthor: 0, reviewClosedAuthor: 0 } },
    ]);
    for (const record of records) {
        try {
            if (record.automaticReview?.kind === "submitting") {
                // A newly authorized grant may finish a previously accepted intent;
                // provenance and deterministic proposal identity stay with that intent.
                const recovered = await withFeedbackAccount(
                    record,
                    authority,
                    () => finishReviewIntent(record, authority),
                );
                return { recovered };
            }
            const claimed = await claimNew(record, authority);
            if (claimed) return claimed;
        } catch (error) {
            if (error instanceof AccountLifecycleError) continue;
            throw error;
        }
    }
    return { claim: null };
}
