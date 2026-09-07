import { createHash } from "crypto";
import {
    precisionFixture,
    cleanupPrecision,
} from "./retention-precision-fixture";
import {
    prepareRetentionRecovery,
    applyRetentionRecovery,
} from "@/services/retention-recovery";
import Binding from "@/models/StripeSubscriptionBinding";
import {
    AccessMembershipModel as Membership,
    AccessUserModel as User,
    MembershipAccessModel as Access,
} from "../../../../../../../packages/common-logic/src/member-access/models";
import { getLessonAccess } from "../../../../../../../packages/common-logic/src/member-access/read";
import { digest } from "@/services/retention-recovery/evidence";

let f: Awaited<ReturnType<typeof precisionFixture>>;
beforeEach(async () => {
    f = await precisionFixture();
    await Binding.updateOne(
        { _id: f.binding._id },
        {
            $set: {
                state: {
                    kind: "ended",
                    cutoff: new Date(
                        Math.floor(f.cutoff.getTime() / 1000) * 1000,
                    ),
                    operationId: "stripe-end:test:sub_precision",
                    unknownReleaseCount: 4,
                },
            },
        },
    );
    await Access.updateOne(
        { id: f.saved.id },
        {
            $set: {
                revision: 6,
                state: {
                    ...f.saved.state,
                    snapshot: {
                        cutoff: new Date(
                            Math.floor(f.cutoff.getTime() / 1000) * 1000,
                        ),
                        visibleLessonIds: [],
                        retainedLessonIds: [],
                        unknownReleaseCount: 4,
                    },
                    endedAt: new Date(),
                },
            },
        },
    );
});
afterEach(async () => {
    jest.restoreAllMocks();
    await cleanupPrecision(f);
});
function input() {
    const preimageJson = JSON.stringify(f.saved);
    return {
        domainId: String(f.domain._id),
        adminUserId: f.admin.userId,
        preimageJson,
        preimageSha256: createHash("sha256").update(preimageJson).digest("hex"),
    };
}
test("dry run is read-only and hash-bound; apply preserves damaged audit, restores exact earned IDs and is idempotent", async () => {
    const before = await Access.findOne({ id: f.saved.id }).lean();
    const member = await Membership.findById(f.member._id).lean();
    const prepared = await prepareRetentionRecovery(input());
    expect(prepared.currentHash).toBe(digest(before));
    expect(prepared.currentRevision).toBe(6);
    expect(await Access.findOne({ id: f.saved.id }).lean()).toEqual(before);
    expect(
        await applyRetentionRecovery({ ...input(), receipt: prepared }),
    ).toMatchObject({ kind: "applied", revision: 7 });
    const after = await Access.findOne({ id: f.saved.id }).lean();
    expect(after?.state).toEqual(f.saved.state);
    expect(after?.retentionHistory?.[0]).toMatchObject({
        state: before?.state,
        evidenceHash: input().preimageSha256,
        recoveryHash: prepared.repairHash,
    });
    expect(await Membership.findById(f.member._id).lean()).toEqual(member);
    expect(
        await getLessonAccess({
            ...f.key,
            lessonId: "OH5wC5v14ERyJmRW3Y4zr",
            requireMembership: true,
        }),
    ).toEqual({ kind: "allowed", source: "retained" });
    expect(
        (
            await getLessonAccess({
                ...f.key,
                lessonId: "later-added",
                requireMembership: true,
            })
        ).kind,
    ).toBe("denied");
    expect(
        await applyRetentionRecovery({ ...input(), receipt: prepared }),
    ).toMatchObject({ kind: "already-applied" });
    expect((await Access.findOne({ id: f.saved.id }).lean())?.revision).toBe(7);
});
test.each([
    "bytes",
    "state",
    "revision",
    "binding",
    "account",
    "admin",
    "session",
])(
    "rejects changed %s after review without restoring access",
    async (change) => {
        const prepared = await prepareRetentionRecovery(input());
        const command = { ...input(), receipt: prepared };
        if (change === "bytes") command.preimageJson += " ";
        if (change === "state")
            await Access.updateOne(
                { id: f.saved.id },
                { $set: { "state.snapshot.unknownReleaseCount": 5 } },
            );
        if (change === "revision")
            await Access.updateOne(
                { id: f.saved.id },
                { $inc: { revision: 1 } },
            );
        if (change === "binding")
            await Binding.updateOne(
                { _id: f.binding._id },
                { $inc: { revision: 1 } },
            );
        if (change === "account")
            await User.updateOne(
                { _id: f.user._id },
                { $set: { active: false } },
            );
        if (change === "admin")
            await User.updateOne(
                { _id: f.admin._id },
                { $set: { permissions: [] } },
            );
        if (change === "session")
            await Membership.updateOne(
                { _id: f.member._id },
                { $set: { sessionId: "new-session" } },
            );
        await expect(applyRetentionRecovery(command)).rejects.toBeDefined();
        const stored = await Access.findOne({ id: f.saved.id }).lean();
        expect(
            stored?.state.kind === "ended" &&
                stored.state.snapshot.retainedLessonIds,
        ).toEqual([]);
    },
);
test("the final full-record CAS refuses a writer changing state without incrementing revision", async () => {
    const prepared = await prepareRetentionRecovery(input());
    const original = Access.updateOne.bind(Access);
    const spy = jest.spyOn(Access, "updateOne").mockImplementationOnce(((
        filter,
        update,
        options,
    ) =>
        (async () => {
            await original(
                { id: f.saved.id },
                { $set: { "state.snapshot.unknownReleaseCount": 8 } },
            );
            return original(filter, update, options);
        })()) as typeof Access.updateOne);
    await expect(
        applyRetentionRecovery({ ...input(), receipt: prepared }),
    ).rejects.toMatchObject({ code: "conflict" });
    spy.mockRestore();
    const period = await Access.findOne({ id: f.saved.id }).lean();
    expect(
        period?.state.kind === "ended" &&
            period.state.snapshot.retainedLessonIds,
    ).toEqual([]);
});

test("a saved restoration with failed binding settlement stays explicitly reconciliation-needed on repeat", async () => {
    const prepared = await prepareRetentionRecovery(input());
    const original = Binding.updateOne.bind(Binding);
    let interrupted = false;
    const spy = jest.spyOn(Binding, "updateOne").mockImplementation(((
        filter,
        update,
        options,
    ) => {
        if (
            !interrupted &&
            !Array.isArray(update) &&
            update?.$set?.["state.unknownReleaseCount"] !== undefined
        ) {
            interrupted = true;
            return Promise.reject(new Error("lost settlement response"));
        }
        return original(filter, update, options);
    }) as typeof Binding.updateOne);
    await expect(
        applyRetentionRecovery({ ...input(), receipt: prepared }),
    ).rejects.toThrow("lost settlement response");
    spy.mockRestore();
    expect((await Access.findOne({ id: f.saved.id }).lean())?.state).toEqual(
        f.saved.state,
    );
    expect(
        await applyRetentionRecovery({ ...input(), receipt: prepared }),
    ).toMatchObject({ kind: "applied-needs-reconciliation" });
    expect((await Binding.findById(f.binding._id).lean())?.state).toMatchObject(
        { unknownReleaseCount: 4 },
    );
});
