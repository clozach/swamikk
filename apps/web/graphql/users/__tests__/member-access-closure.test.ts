import mongoose from "mongoose";
import { Constants } from "@courselit/common-models";
import {
    AccessUserModel as User,
    AccessMembershipModel as Membership,
    MembershipAccessModel as Access,
} from "../../../../../packages/common-logic/src/member-access/models";
import {
    ensureMembershipAccess,
    prepareRetention,
    endMembership,
} from "../../../../../packages/common-logic/src/member-access/lifecycle";
import { deleteUserMemberAccess } from "../../../../../packages/common-logic/src/member-access/cleanup";
import {
    beginAccountClosure,
    markAccountErasing,
    finishAccountClosure,
} from "../../../../../packages/common-logic/src/account-lifecycle/gate";
import { AccountLifecycleModel } from "../../../../../packages/common-logic/src/account-lifecycle/model";

let key: any, membership: any;
beforeEach(async () => {
    const domainId = new mongoose.Types.ObjectId().toString();
    key = {
        domainId,
        userId: "member",
        courseId: "course",
        membershipId: `membership-${domainId}`,
        membershipSessionId: "session",
    };
    await User.create({
        domain: domainId,
        userId: key.userId,
        email: "member@example.com",
        active: true,
    });
    membership = await Membership.create({
        domain: domainId,
        membershipId: key.membershipId,
        sessionId: key.membershipSessionId,
        userId: key.userId,
        entityId: key.courseId,
        entityType: Constants.MembershipEntityType.COURSE,
        paymentPlanId: "plan",
        status: Constants.MembershipStatus.ACTIVE,
        accessActivation: {
            sessionId: key.membershipSessionId,
            startedAt: new Date("2026-01-01"),
        },
    });
});
afterEach(async () => {
    jest.restoreAllMocks();
    for (const model of [
        User,
        Membership,
        Access,
        AccountLifecycleModel,
    ] as any[])
        await model.deleteMany({ domain: key.domainId });
});
function pauseNextAccessWrite() {
    let entered!: () => void, release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
        release = resolve;
    });
    const original = Access.updateOne.bind(Access);
    jest.spyOn(Access, "updateOne").mockImplementationOnce((async (
        ...args: any[]
    ) => {
        entered();
        await releasePromise;
        return (original as any)(...args);
    }) as any);
    return { entered: enteredPromise, release };
}
async function erase() {
    await markAccountErasing(key);
    await deleteUserMemberAccess(key.domainId, key.userId);
    await User.deleteOne({ domain: key.domainId, userId: key.userId });
    await finishAccountClosure(key);
}

it("drains a reserved access creation before cleanup and cannot recreate its private period afterwards", async () => {
    const paused = pauseNextAccessWrite();
    const creating = ensureMembershipAccess({
        domainId: key.domainId,
        membership,
    });
    await paused.entered;
    const closure = await beginAccountClosure(key);
    const directCleanup = await deleteUserMemberAccess(
        key.domainId,
        key.userId,
    ).then(
        () => "erased",
        (error) => error.code,
    );
    // Exercise the old failure order too: before adoption closure incorrectly
    // reports ready, erases the user, then the late upsert recreates a period.
    if (closure.kind !== "pending") await erase();
    paused.release();
    await creating;
    if (closure.kind === "pending") await erase();
    expect({
        closure: closure.kind,
        directCleanup,
        remaining: await Access.countDocuments({ domain: key.domainId }),
    }).toEqual({
        closure: "pending",
        directCleanup: "account_busy",
        remaining: 0,
    });
    await expect(
        ensureMembershipAccess({ domainId: key.domainId, membership }),
    ).rejects.toMatchObject({ code: "account_unavailable" });
});

it("refuses access recreation once closure has begun even while the user row still exists", async () => {
    expect((await beginAccountClosure(key)).kind).toBe("ready");
    await expect(
        ensureMembershipAccess({ domainId: key.domainId, membership }),
    ).rejects.toMatchObject({ code: "account_unavailable" });
    expect(await Access.countDocuments({ domain: key.domainId })).toBe(0);
});

it("does not recreate a retained period when cleanup wins against an existing-period finalization", async () => {
    await ensureMembershipAccess({ domainId: key.domainId, membership });
    const operation = {
        ...key,
        operationId: "cancel",
        cutoff: new Date("2026-02-01"),
    };
    await prepareRetention(operation);
    const paused = pauseNextAccessWrite();
    const ending = endMembership(operation).then(
        () => "ended",
        (error) => error.code,
    );
    await paused.entered;
    expect((await beginAccountClosure(key)).kind).toBe("ready");
    await erase();
    paused.release();
    expect(await ending).toBe("unavailable");
    expect(await Access.countDocuments({ domain: key.domainId })).toBe(0);
});
