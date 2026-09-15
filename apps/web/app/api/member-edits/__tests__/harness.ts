import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import { auth } from "@/auth";
import { MemberMimicModel } from "@/services/member-mimic/model";
import { startMemberMimic } from "@/services/member-mimic/session";
import { MEMBER_MIMIC_COOKIE } from "@/services/member-mimic/constants";
import { MemberEditModel } from "@/services/member-edits/model";
import { ContactPreferencesModel } from "@/services/contact-preferences/model";
import { AccountLifecycleModel } from "../../../../../../packages/common-logic/src/account-lifecycle/model";

/**
 * A tenant with its owner (also an admin), a second admin who is not the
 * owner, and a member. The default actor is the second admin, so a member's
 * snapshot carries no email lock, the owner's reads `owner`, and the admin's
 * own reads `self`.
 */
export interface Fixture {
    suffix: string;
    domain: any;
    owner: any;
    admin: any;
    member: any;
    sessionId: string;
}

export async function seed(): Promise<Fixture> {
    const suffix = randomUUID();
    const domain = await DomainModel.create({
        name: `edits-${suffix}`,
        email: `owner-${suffix}@example.com`,
        settings: { title: "Karuna School" },
    });
    const owner = await UserModel.create({
        domain: domain._id,
        userId: `owner-${suffix}`,
        email: domain.email,
        name: "Owner",
        active: true,
        permissions: ["user:manage", "setting:manage"],
        unsubscribeToken: `owner-token-${suffix}`,
    });
    const admin = await UserModel.create({
        domain: domain._id,
        userId: `admin-${suffix}`,
        email: `admin-${suffix}@example.com`,
        name: "Support Admin",
        active: true,
        permissions: ["user:manage"],
        unsubscribeToken: `admin-token-${suffix}`,
    });
    const member = await UserModel.create({
        domain: domain._id,
        userId: `member-${suffix}`,
        email: `member-${suffix}@example.com`,
        name: "Member",
        active: true,
        permissions: [],
        unsubscribeToken: `member-token-${suffix}`,
    });
    const sessionId = randomUUID();
    signInAs(admin, sessionId);
    return { suffix, domain, owner, admin, member, sessionId };
}

export async function teardown(fixture: Fixture) {
    const domain = fixture.domain._id;
    await MemberEditModel.deleteMany({ domain });
    await MemberMimicModel.deleteMany({ domain });
    await ContactPreferencesModel.deleteMany({ domain });
    await AccountLifecycleModel.deleteMany({ domain });
    await mongoose.connection.collection("sessions").deleteMany({ domain });
    await UserModel.deleteMany({ domain });
    await DomainModel.deleteOne({ _id: domain });
}

/** The admin's Better Auth session, as `requestContext` and the mimic resolver see it. */
export function signInAs(user: any, sessionId: string) {
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: user.email },
        session: { id: sessionId },
    });
}

export function signOut() {
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
}

/** Opens Member Mimic as `actor` on `subject`; returns the cookie header value. */
export async function mimic(
    fixture: Fixture,
    subject: any,
    actor: any = fixture.admin,
): Promise<string> {
    const started = await startMemberMimic(
        { userId: subject.userId },
        {
            subdomain: fixture.domain,
            user: actor,
            address: "https://school.example",
        } as any,
        new Headers(),
    );
    return `${MEMBER_MIMIC_COOKIE}=${started.token}`;
}

export function request(
    fixture: Fixture,
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
) {
    return new NextRequest(`https://school.example${path}`, {
        method,
        headers: {
            domain: fixture.domain.name,
            domaintitle: "Karuna School",
            host: "school.example",
            origin: "https://school.example",
            "content-type": "application/json",
            ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

export const change = (field: string, before: string, after: string) => ({
    field,
    before,
    after,
});
