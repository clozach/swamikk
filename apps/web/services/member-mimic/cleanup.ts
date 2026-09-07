import { MemberMimicModel } from "./model";

/** Call from account deletion/revocation; keep bounded actor/subject audit records. */
export async function revokeMemberMimicForUser(domain: string, userId: string) {
    await MemberMimicModel.updateMany(
        {
            domain,
            $or: [{ actorUserId: userId }, { subjectUserId: userId }],
            "state.kind": "active",
        },
        {
            $set: {
                state: {
                    kind: "revoked",
                    at: new Date().toISOString(),
                    by: "account-removed",
                },
            },
            $unset: { activeSessionKey: 1 },
        },
    );
}

export async function deleteTenantMemberMimicData(domain: string) {
    await MemberMimicModel.deleteMany({ domain });
}
