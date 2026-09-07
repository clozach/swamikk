import { NextRequest } from "next/server";
import {
    graphql,
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
} from "graphql";
import { GET } from "../route";
import mutations from "@/graphql/cohorts/mutation";
import {
    updateCohort,
    syncCohortFromCourse,
    deleteCohort,
} from "@/graphql/cohorts/logic";
import { classChoices, selectedClass } from "@/services/class-checkout/choices";
import Cohort from "@/models/Cohort";
import Course from "@/models/Course";
import Membership from "@/models/Membership";
import { fixture } from "./fixtures";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
        name: "Query",
        fields: { ping: { type: GraphQLString } },
    }),
    mutation: new GraphQLObjectType({
        name: "Mutation",
        fields: { updateCohort: mutations.updateCohort },
    }),
});
it("returns only opted-in name/date/opaque choice, never private roster data", async () => {
    const f = await fixture();
    const privateCohort = await Cohort.create({
        domain: f.domain._id,
        courseId: f.course.courseId,
        cohortId: "private",
        name: "Private pastoral group",
        members: [f.user.userId],
    });
    expect(privateCohort.checkoutState).toBe("private");
    const response = await GET(
        new NextRequest(
            `http://localhost/api/class-checkout?courseId=${f.course.courseId}&planId=${f.plan.planId}`,
            { headers: { domain: f.domain.name } },
        ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const data = await response.json();
    expect(data.kind).toBe("class");
    expect(data.choices).toHaveLength(1);
    expect(Object.keys(data.choices[0]).sort()).toEqual([
        "cohortId",
        "fingerprint",
        "name",
        "startAt",
    ]);
    expect(JSON.stringify(data)).not.toContain("Private pastoral");
    expect(JSON.stringify(data)).not.toContain(f.user.userId);
});
it("closed listings retain the class requirement instead of becoming an undated purchase", async () => {
    const f = await fixture();
    await Cohort.updateOne(
        { _id: f.cohort._id },
        { $set: { checkoutState: "listed-closed" } },
    );
    expect(
        await classChoices(
            String(f.domain._id),
            f.course.courseId,
            f.plan.planId,
        ),
    ).toEqual({ kind: "class", choices: [] });
    await expect(
        selectedClass(String(f.domain._id), f.course.courseId, f.plan.planId),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(deleteCohort(f.cohort.cohortId, f.ctx)).rejects.toMatchObject({
        code: "conflict",
    });
});
it("rejects unknown query fields, cross-tenant targets and unpublished products", async () => {
    const f = await fixture(),
        other = await fixture();
    const url = `http://localhost/api/class-checkout?courseId=${f.course.courseId}&planId=${f.plan.planId}`;
    expect(
        (
            await GET(
                new NextRequest(url + "&members=true", {
                    headers: { domain: f.domain.name },
                }),
            )
        ).status,
    ).toBe(400);
    expect(
        (
            await GET(
                new NextRequest(url, {
                    headers: { domain: other.domain.name },
                }),
            )
        ).status,
    ).toBe(404);
    await Course.updateOne(
        { _id: f.course._id },
        { $set: { published: false } },
    );
    expect(
        (
            await GET(
                new NextRequest(url, { headers: { domain: f.domain.name } }),
            )
        ).status,
    ).toBe(404);
});
it("uses the native GraphQL enum and reviewed revision; stale and unauthorized edits cannot publish a date", async () => {
    const f = await fixture();
    const source = `mutation($id:String!,$rev:Float!){updateCohort(cohortId:$id,checkoutState:LISTED_CLOSED,expectedCheckoutRevision:$rev){checkoutState checkoutRevision}}`;
    const input = {
        schema,
        source,
        contextValue: f.ctx,
        variableValues: { id: f.cohort.cohortId, rev: 0 },
    };
    const closed = await graphql(input);
    expect(closed.errors).toBeUndefined();
    expect(closed.data?.updateCohort).toMatchObject({
        checkoutState: "listed-closed",
        checkoutRevision: 1,
    });
    expect((await graphql(input)).errors?.length).toBe(1);
    await expect(
        updateCohort(
            {
                cohortId: f.cohort.cohortId,
                checkoutState: "private",
                expectedCheckoutRevision: 1,
            },
            f.ctx,
        ),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
        (
            await graphql({
                ...input,
                contextValue: {
                    ...f.ctx,
                    user: { ...f.user.toObject(), permissions: [] },
                },
                variableValues: { id: f.cohort.cohortId, rev: 1 },
            })
        ).errors?.length,
    ).toBe(1);
});
it("requires a future real date to open and invalidates a saved selection on date edits", async () => {
    const f = await fixture();
    await expect(
        updateCohort(
            {
                cohortId: f.cohort.cohortId,
                schedule: null,
                expectedCheckoutRevision: 0,
            },
            f.ctx,
        ),
    ).rejects.toMatchObject({ code: "bad_request" });
    await updateCohort(
        {
            cohortId: f.cohort.cohortId,
            schedule: { startAt: Date.now() + 40 * 86400000 },
            expectedCheckoutRevision: 0,
        },
        f.ctx,
    );
    await expect(
        selectedClass(String(f.domain._id), f.course.courseId, f.plan.planId, {
            cohortId: f.cohort.cohortId,
            fingerprint: f.fingerprint,
        }),
    ).rejects.toMatchObject({ code: "conflict" });
});
it("preserves private course sync but refuses a listing change that occurs before the roster write", async () => {
    const f = await fixture();
    await Cohort.updateOne(
        { _id: f.cohort._id },
        { $set: { checkoutState: "private" } },
    );
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { status: "active" } },
    );
    await syncCohortFromCourse(f.cohort.cohortId, f.ctx);
    expect((await Cohort.findById(f.cohort._id).lean())?.members).toEqual([
        f.user.userId,
    ]);
    await Cohort.updateOne({ _id: f.cohort._id }, { $set: { members: [] } });
    const original = Cohort.updateOne.bind(Cohort);
    const spy = jest.spyOn(Cohort, "updateOne").mockImplementationOnce(
        (...args: any[]) =>
            ({
                then: async (resolve: any, reject: any) => {
                    try {
                        await original(
                            { _id: f.cohort._id },
                            { $set: { checkoutState: "listed-open" } },
                        );
                        resolve(await (original as any)(...args));
                    } catch (error) {
                        reject(error);
                    }
                },
            }) as any,
    );
    await expect(
        syncCohortFromCourse(f.cohort.cohortId, f.ctx),
    ).rejects.toMatchObject({ code: "conflict" });
    spy.mockRestore();
    expect((await Cohort.findById(f.cohort._id).lean())?.members).toEqual([]);
});
