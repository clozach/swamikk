import {
    precisionFixture,
    cleanupPrecision,
} from "./retention-precision-fixture";
import { reconcileSubscription } from "@/payments-new/stripe-lifecycle/subscription";
import Binding from "@/models/StripeSubscriptionBinding";
import Cancellation from "@/models/BillingCancellation";
import { MembershipAccessModel as Access } from "../../../../../../../packages/common-logic/src/member-access/models";
import { getLessonAccess } from "../../../../../../../packages/common-logic/src/member-access/read";
import { frozenSnapshotWithinProviderEnd } from "../../../../../../../packages/common-logic/src/member-access/provider-boundary";
import Stripe from "stripe";
import StripePayment from "@/payments-new/stripe-payment";
import { getPaymentMethod } from "@/payments-new";
import { POST } from "../route";
jest.mock("@/payments-new", () => ({ getPaymentMethod: jest.fn() }));

let f: Awaited<ReturnType<typeof precisionFixture>>;
afterEach(async () => {
    if (f) await cleanupPrecision(f);
});
const reconcile = () =>
    reconcileSubscription(
        String(f.domain._id),
        f.event,
        f.provider,
        "sub_precision",
    );
const read = (lessonId: string) =>
    getLessonAccess({ ...f.key, lessonId, requireMembership: true });

test("the exact native .451 frozen proof survives a terminal .000 update and later content edits", async () => {
    f = await precisionFixture();
    expect((await reconcile()).status).toBe(200);
    const saved = await Access.findOne({ id: f.saved.id }).lean();
    expect(saved?.state).toEqual(f.saved.state);
    expect(saved?.revision).toBe(3);
    expect(await read("OH5wC5v14ERyJmRW3Y4zr")).toEqual({
        kind: "allowed",
        source: "retained",
    });
    expect((await read(f.saved.state.snapshot.visibleLessonIds[0])).kind).toBe(
        "denied",
    );
    expect((await read("later-added")).kind).toBe("denied");
    const binding = await Binding.findById(f.binding._id).lean();
    expect(binding?.state).toMatchObject({
        kind: "ended",
        cutoff: new Date("2026-09-07T06:51:51.000Z"),
        unknownReleaseCount: 0,
        nativeCancellation: {
            operationId: f.saved.state.operationId,
            cutoff: f.cutoff,
        },
    });
    await reconcile();
    expect((await Access.findOne({ id: f.saved.id }).lean())?.revision).toBe(3);
    expect(saved?.deliveries).toEqual([]);
});

test("a busy binding's cap cannot erase a proven prepared snapshot before reconciliation claims it", async () => {
    f = await precisionFixture();
    const prepared = {
        kind: "prepared",
        operationId: f.saved.state.operationId,
        snapshot: f.saved.state.snapshot,
        preparedAt: f.cutoff,
    };
    await Access.updateOne({ id: f.saved.id }, { $set: { state: prepared } });
    await Binding.updateOne(
        { _id: f.binding._id },
        {
            $set: {
                claim: { id: "busy", eventId: "other", startedAt: new Date() },
            },
        },
    );
    await expect(reconcile()).rejects.toMatchObject({
        reason: "subscription-reconciliation-in-progress",
    });
    expect((await Access.findOne({ id: f.saved.id }).lean())?.state).toEqual(
        prepared,
    );
    expect((await read("OH5wC5v14ERyJmRW3Y4zr")).kind).toBe("allowed");
});

test("a genuinely earlier provider second narrows and preserves the superseded frozen audit", async () => {
    f = await precisionFixture();
    f.subscription.ended_at--;
    await reconcile();
    const period = await Access.findOne({ id: f.saved.id }).lean();
    expect(period?.state.kind).toBe("ended");
    expect(period?.retentionHistory?.[0].state).toEqual(f.saved.state);
    expect((await read("OH5wC5v14ERyJmRW3Y4zr")).kind).toBe("denied");
    const boundary = {
        cutoff: new Date(f.cutoff.getTime() - 500),
        nativeCancellation: {
            operationId: f.saved.state.operationId,
            cutoff: f.cutoff,
            targets: [
                {
                    membershipId: f.saved.membershipId,
                    courseId: f.saved.courseId,
                },
            ],
        },
    };
    expect(
        frozenSnapshotWithinProviderEnd(f.saved, f.saved.state, boundary),
    ).toBe(false); // Cross-second <1s is not tolerance.
});

test("without matching native confirmation no precision exception applies; later confirmation recovers preserved proof once", async () => {
    f = await precisionFixture(false);
    await reconcile();
    let period = await Access.findOne({ id: f.saved.id }).lean();
    expect(
        period?.state.kind === "ended" &&
            period.state.snapshot.retainedLessonIds,
    ).toEqual([]);
    expect(period?.retentionHistory?.[0].state).toEqual(f.saved.state);
    await Cancellation.create(f.cancellation);
    await reconcile();
    period = await Access.findOne({ id: f.saved.id }).lean();
    expect(period?.state).toEqual(f.saved.state);
    expect((await read("OH5wC5v14ERyJmRW3Y4zr")).kind).toBe("allowed");
    const revision = period?.revision;
    await reconcile();
    expect((await Access.findOne({ id: f.saved.id }).lean())?.revision).toBe(
        revision,
    );
});

test.each(["operation", "course", "session", "mode"])(
    "a mismatched %s cannot authorize same-second preserved access",
    async (field) => {
        f = await precisionFixture();
        const patch =
            field === "operation"
                ? { operationId: "different-operation" }
                : field === "course"
                  ? { "targets.0.accessKey.courseId": "different-course" }
                  : field === "session"
                    ? { membershipSessionId: "different-session" }
                    : { "quote.mode": "live" };
        await Cancellation.updateOne(
            { operationId: f.saved.state.operationId },
            { $set: patch },
        );
        await reconcile();
        expect((await read("OH5wC5v14ERyJmRW3Y4zr")).kind).toBe("denied");
    },
);

test("the signed native route preserves the exact preimage and deduplicates replay", async () => {
    f = await precisionFixture();
    const payment = await new StripePayment({
        currencyISOCode: "NZD",
        stripeKey: "pk_test_native",
        stripeSecret: "sk_test_native",
        stripeWebhookSecret: "whsec_precision",
    }).setup();
    payment.stripe.subscriptions.retrieve = f.provider.subscriptions.retrieve;
    (getPaymentMethod as jest.Mock).mockResolvedValue(payment);
    const body = JSON.stringify(f.event);
    const signature = Stripe.webhooks.generateTestHeaderString({
        payload: body,
        secret: "whsec_precision",
    });
    const request = () =>
        ({
            headers: new Headers({
                domain: f.domain.name,
                "stripe-signature": signature,
            }),
            text: async () => body,
        }) as any;
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    expect((await Access.findOne({ id: f.saved.id }).lean())?.state).toEqual(
        f.saved.state,
    );
    expect((await read("OH5wC5v14ERyJmRW3Y4zr")).kind).toBe("allowed");
});

test("a concurrent event attaching native proof cannot be overwritten by an older ending worker", async () => {
    f = await precisionFixture(false);
    const original = Binding.updateOne.bind(Binding);
    let raced = false;
    const spy = jest.spyOn(Binding, "updateOne").mockImplementation(((
        filter,
        update,
        options,
    ) => {
        if (
            !raced &&
            !Array.isArray(update) &&
            update?.$set?.state?.kind === "ended"
        ) {
            raced = true;
            return (async () => {
                await Cancellation.create(f.cancellation);
                await expect(reconcile()).rejects.toMatchObject({
                    reason: "subscription-reconciliation-in-progress",
                });
                return original(filter, update, options);
            })();
        }
        return original(filter, update, options);
    }) as typeof Binding.updateOne);
    try {
        await reconcile();
    } finally {
        spy.mockRestore();
    }
    expect(raced).toBe(true);
    expect((await Binding.findById(f.binding._id).lean())?.state).toMatchObject(
        {
            kind: "ended",
            nativeCancellation: { operationId: f.saved.state.operationId },
            unknownReleaseCount: 0,
        },
    );
    expect((await Access.findOne({ id: f.saved.id }).lean())?.state).toEqual(
        f.saved.state,
    );
});
