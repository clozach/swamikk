import UserModel from "@/models/User";
import MembershipModel from "@/models/Membership";
import { Constants } from "@courselit/common-models";
import type { Types } from "mongoose";

/** A newsletter row alone is not proof of an account or course membership. */
export async function linkedMemberIds(
    domain: Types.ObjectId,
    userIds: string[],
): Promise<Set<string>> {
    if (!userIds.length) return new Set();
    const [users, memberships] = await Promise.all([
        UserModel.find(
            { domain, userId: { $in: userIds }, active: true },
            { userId: 1, emailVerified: 1, _id: 0 },
        ).lean(),
        MembershipModel.distinct("userId", {
            domain,
            userId: { $in: userIds },
            status: {
                $in: [
                    Constants.MembershipStatus.ACTIVE,
                    Constants.MembershipStatus.EXPIRED,
                ],
            },
        }),
    ]);
    const enrolled = new Set(memberships);
    const rows = users as unknown as {
        userId: string;
        emailVerified?: boolean;
    }[];
    return new Set(
        rows
            .filter(
                (user) =>
                    user.emailVerified === true || enrolled.has(user.userId),
            )
            .map((user) => user.userId),
    );
}
