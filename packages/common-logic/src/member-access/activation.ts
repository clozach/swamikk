import { randomUUID } from "crypto";
import { Constants, type Membership } from "@courselit/common-models";
import type {
    MembershipAccessPeriod,
    MembershipAccessKey,
} from "../../../common-models/src/member-access";
import {
    AccessMembershipModel,
    AccessUserModel,
    MembershipAccessModel,
} from "./models";
import { accessAssert } from "./errors";
import { accessDate, accessKey, accessPeriod } from "./keys";
import { withAccountWrite } from "../account-lifecycle/gate";

type EnsureMembershipAccessInput = {
    domainId: string;
    membership: Membership;
    startedAt?: Date;
};
export async function ensureMembershipAccess(
    input: EnsureMembershipAccessInput,
): Promise<MembershipAccessPeriod> {
    return withAccountWrite(
        {
            domainId: input.domainId,
            userId: input.membership.userId,
            purpose: "membership-access",
        },
        () => ensureAccessPeriod(input),
    );
}
async function ensureAccessPeriod({
    domainId,
    membership,
    startedAt,
}: EnsureMembershipAccessInput): Promise<MembershipAccessPeriod> {
    const key: MembershipAccessKey = {
        domainId,
        userId: membership.userId,
        courseId: membership.entityId,
        membershipId: membership.membershipId,
        membershipSessionId: membership.sessionId,
    };
    const filter = accessKey(key);
    const existing = await MembershipAccessModel.findOne(filter).lean();
    if (existing) return accessPeriod(existing);
    const current = await AccessMembershipModel.findOne({
        domain: domainId,
        membershipId: key.membershipId,
        sessionId: key.membershipSessionId,
        userId: key.userId,
        entityId: key.courseId,
        entityType: Constants.MembershipEntityType.COURSE,
        status: Constants.MembershipStatus.ACTIVE,
    }).lean();
    accessAssert(
        current,
        "not_found",
        "An active matching course membership is required.",
    );
    const activation = current.accessActivation;
    const recordedStart =
        activation?.sessionId === key.membershipSessionId
            ? accessDate(activation.startedAt)
            : undefined;
    if (startedAt)
        accessAssert(
            recordedStart && recordedStart.getTime() === startedAt.getTime(),
            "conflict",
            "The recorded membership start must be reused.",
        );
    const user = await AccessUserModel.findOne({
        domain: domainId,
        userId: key.userId,
        active: true,
    }).lean();
    accessAssert(user, "not_found", "The member is unavailable.");
    const purchase = user.purchases?.find(
        (item: any) => item.courseId === key.courseId,
    );
    const now = new Date();
    await MembershipAccessModel.init();
    try {
        await MembershipAccessModel.updateOne(
            filter,
            {
                $setOnInsert: {
                    ...filter,
                    id: randomUUID(),
                    start: recordedStart
                        ? { kind: "recorded", at: recordedStart }
                        : { kind: "legacy-unknown" },
                    state: { kind: "active" },
                    groupReleases: recordedStart
                        ? []
                        : Array.from(
                              new Set<string>(purchase?.accessibleGroups || []),
                          ).map((groupId) => ({
                              kind: "legacy-unknown",
                              groupId,
                          })),
                    ...(recordedStart
                        ? {}
                        : {
                              lastRelativeReleaseAt: accessDate(
                                  purchase?.lastDripAt,
                              ),
                          }),
                    deliveries: [],
                    reopenedOperations: [],
                    revision: 0,
                    createdAt: now,
                    updatedAt: now,
                },
            },
            { upsert: true },
        );
    } catch (error: any) {
        if (error?.code !== 11000) throw error;
    }
    const result = await MembershipAccessModel.findOne(filter).lean();
    accessAssert(
        result,
        "unavailable",
        "Membership access could not be recorded.",
    );
    return accessPeriod(result);
}

export async function ensureOperationPeriod(
    input: MembershipAccessKey,
): Promise<MembershipAccessPeriod> {
    const existing = await MembershipAccessModel.findOne(
        accessKey(input),
    ).lean();
    if (existing) return accessPeriod(existing);
    const membership = await AccessMembershipModel.findOne({
        domain: input.domainId,
        membershipId: input.membershipId,
        sessionId: input.membershipSessionId,
        userId: input.userId,
        entityId: input.courseId,
        entityType: Constants.MembershipEntityType.COURSE,
    }).lean();
    accessAssert(
        membership,
        "not_found",
        "The membership period is unavailable.",
    );
    return ensureMembershipAccess({ domainId: input.domainId, membership });
}
