import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getPaymentMethodFromSettings } from "@/payments-new";
import { POST } from "../../payment/initiate/route";
import { syncCohortFromCourse } from "@/graphql/cohorts/logic";
import Cohort from "@/models/Cohort";
import { MembershipModel as Membership } from "@/services/member-billing/models";
import Invoice from "@/models/Invoice";
import { fixture } from "./fixtures";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/payments-new", () => ({
    getPaymentMethodFromSettings: jest.fn(),
}));

it("does not synchronize an ordinary active course member into an unselected listed class", async () => {
    const f = await fixture();
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { status: "active" } },
    );
    await expect(
        syncCohortFromCourse(f.cohort.cohortId, f.ctx),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await Cohort.findById(f.cohort._id).lean())?.members).toEqual([]);
});

it("allocates one financial intent/provider attempt for concurrent class checkout submissions", async () => {
    const f = await fixture();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: f.user.email },
    });
    const initiate = jest
        .fn()
        .mockResolvedValue("https://checkout.stripe.com/c/pay/cs_test_example");
    (getPaymentMethodFromSettings as jest.Mock).mockResolvedValue({
        name: "stripe",
        initiate,
        getCurrencyISOCode: async () => "NZD",
    });
    const request = () =>
        new NextRequest("http://localhost/api/payment/initiate", {
            method: "POST",
            headers: {
                domain: f.domain.name,
                origin: "http://localhost",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                id: f.course.courseId,
                type: "course",
                planId: f.plan.planId,
                origin: "http://localhost",
                classChoice: {
                    cohortId: f.cohort.cohortId,
                    fingerprint: f.fingerprint,
                },
            }),
        });
    const results = await Promise.all([POST(request()), POST(request())]);
    expect(results.some((result) => result.status === 200)).toBe(true);
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(await Invoice.countDocuments({ domain: f.domain._id })).toBe(1);
});

it("reuses the saved class checkout instead of allocating another invoice on a retry", async () => {
    const f = await fixture();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: f.user.email },
    });
    const initiate = jest
        .fn()
        .mockResolvedValue("https://checkout.stripe.com/c/pay/cs_test_example");
    (getPaymentMethodFromSettings as jest.Mock).mockResolvedValue({
        name: "stripe",
        initiate,
        getCurrencyISOCode: async () => "NZD",
    });
    const request = () =>
        new NextRequest("http://localhost/api/payment/initiate", {
            method: "POST",
            headers: {
                domain: f.domain.name,
                origin: "http://localhost",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                id: f.course.courseId,
                type: "course",
                planId: f.plan.planId,
                origin: "http://localhost",
                classChoice: {
                    cohortId: f.cohort.cohortId,
                    fingerprint: f.fingerprint,
                },
            }),
        });
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(await Invoice.countDocuments({ domain: f.domain._id })).toBe(1);
});

it("does not replace the membership session through another plan while class provider creation is in flight", async () => {
    const f = await fixture();
    const Plan = (await import("@/models/PaymentPlan")).default;
    const subscription = await Plan.create({
        domain: f.domain._id,
        planId: randomUUID(),
        userId: f.user.userId,
        entityId: f.course.courseId,
        entityType: "course",
        name: "Monthly",
        type: "subscription",
        subscriptionMonthlyAmount: 10,
    });
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: f.user.email },
    });
    let started!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        started = resolve;
    });
    const pause = new Promise<void>((resolve) => {
        release = resolve;
    });
    const initiate = jest
        .fn()
        .mockImplementationOnce(async () => {
            started();
            await pause;
            return "https://checkout.stripe.com/c/pay/cs_test_first";
        })
        .mockResolvedValue("https://checkout.stripe.com/c/pay/cs_test_second");
    (getPaymentMethodFromSettings as jest.Mock).mockResolvedValue({
        name: "stripe",
        initiate,
        getCurrencyISOCode: async () => "NZD",
    });
    const request = (planId: string, choice: boolean) =>
        new NextRequest("http://localhost/api/payment/initiate", {
            method: "POST",
            headers: {
                domain: f.domain.name,
                origin: "http://localhost",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                id: f.course.courseId,
                type: "course",
                planId,
                origin: "http://localhost",
                ...(choice
                    ? {
                          classChoice: {
                              cohortId: f.cohort.cohortId,
                              fingerprint: f.fingerprint,
                          },
                      }
                    : {}),
            }),
        });
    const first = POST(request(f.plan.planId, true));
    await reached;
    const before = await Membership.findById(f.member._id).lean();
    const other = await POST(request(subscription.planId, false));
    release();
    await first;
    expect(other.status).toBe(409);
    expect((await Membership.findById(f.member._id).lean())?.sessionId).toBe(
        before?.sessionId,
    );
    expect(initiate).toHaveBeenCalledTimes(1);
});
