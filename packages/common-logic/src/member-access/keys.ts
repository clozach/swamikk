import type {
    MembershipAccessKey,
    MembershipAccessPeriod,
} from "../../../common-models/src/member-access";
import type { InternalMembershipAccess } from "../../../orm-models/src/models/member-access";
import { accessAssert } from "./errors";

export function accessKey(input: MembershipAccessKey) {
    const key = {
        domain: input.domainId,
        userId: input.userId,
        courseId: input.courseId,
        membershipId: input.membershipId,
        membershipSessionId: input.membershipSessionId,
    };
    for (const value of Object.values(key))
        accessAssert(
            typeof value === "string" &&
                value.length > 0 &&
                value.length <= 256,
            "invalid",
            "Access identifiers are required.",
        );
    return key;
}
export function accessPeriod(
    record: InternalMembershipAccess | any,
): MembershipAccessPeriod {
    const value =
        typeof record.toObject === "function" ? record.toObject() : record;
    return { ...value, domainId: String(value.domain) };
}
export function accessDate(value: unknown): Date | undefined {
    if (value === null || value === undefined) return undefined;
    const date = value instanceof Date ? value : new Date(value as string);
    return Number.isFinite(date.getTime()) ? date : undefined;
}
