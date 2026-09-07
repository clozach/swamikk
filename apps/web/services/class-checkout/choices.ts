import { createHash } from "crypto";
import { Constants } from "@courselit/common-models";
import Cohort, { type InternalCohort } from "@/models/Cohort";
import Course from "@/models/Course";
import { PaymentPlanModel as Plan } from "@/services/member-billing/models";
import { requireCondition } from "@/services/content-changes/errors";
import type { BookedClass, ClassChoice, ClassChoices } from "./types";

export const listedStates = ["listed-closed", "listed-open"];
export function classFingerprint(cohort: InternalCohort & { _id?: unknown }) {
    return createHash("sha256")
        .update(
            JSON.stringify([
                String(cohort._id),
                cohort.cohortId,
                cohort.courseId,
                cohort.name,
                cohort.schedule?.startAt
                    ? new Date(cohort.schedule.startAt).toISOString()
                    : null,
                cohort.checkoutState,
                cohort.checkoutRevision || 0,
            ]),
        )
        .digest("hex");
}
export async function classChoices(
    domainId: string,
    courseId: string,
    planId: string,
    now = new Date(),
): Promise<ClassChoices> {
    const [course, plan] = await Promise.all([
        Course.findOne({ domain: domainId, courseId, published: true })
            .select("courseId")
            .lean(),
        Plan.findOne({
            domain: domainId,
            planId,
            entityId: courseId,
            entityType: "course",
            archived: false,
            internal: { $ne: true },
        }).lean(),
    ]);
    requireCondition(
        course && plan,
        "not_found",
        "This offer is unavailable.",
        404,
    );
    if (plan.type !== Constants.PaymentPlanType.ONE_TIME)
        return { kind: "ordinary" };
    const listed = await Cohort.find({
        domain: domainId,
        courseId,
        checkoutState: { $in: listedStates },
    })
        .limit(101)
        .lean();
    requireCondition(
        listed.length <= 100,
        "needs_review",
        "Please contact us to choose a class date.",
        409,
    );
    if (!listed.length) return { kind: "ordinary" };
    return {
        kind: "class",
        choices: listed
            .filter(
                (cohort) =>
                    cohort.checkoutState === "listed-open" &&
                    cohort.schedule?.startAt &&
                    new Date(cohort.schedule.startAt) > now,
            )
            .map((cohort) => ({
                cohortId: cohort.cohortId,
                name: cohort.name,
                startAt: new Date(cohort.schedule!.startAt!).toISOString(),
                fingerprint: classFingerprint(cohort),
            }))
            .sort(
                (a, b) =>
                    a.startAt.localeCompare(b.startAt) ||
                    a.cohortId.localeCompare(b.cohortId),
            ),
    };
}
export async function selectedClass(
    domainId: string,
    courseId: string,
    planId: string,
    choice?: ClassChoice,
): Promise<BookedClass | null> {
    if (
        !choice &&
        !(await Cohort.exists({
            domain: domainId,
            courseId,
            checkoutState: { $in: listedStates },
        }))
    )
        return null;
    const available = await classChoices(domainId, courseId, planId);
    if (available.kind === "ordinary") {
        requireCondition(
            !choice,
            "bad_request",
            "This offer does not take a class date.",
        );
        return null;
    }
    requireCondition(
        choice &&
            available.choices.some(
                (item) =>
                    item.cohortId === choice.cohortId &&
                    item.fingerprint === choice.fingerprint,
            ),
        "conflict",
        "Choose a currently available class date. Refresh the dates before continuing.",
        409,
    );
    const cohort = await Cohort.findOne({
        domain: domainId,
        courseId,
        cohortId: choice.cohortId,
        checkoutState: "listed-open",
    }).lean();
    requireCondition(
        cohort &&
            classFingerprint(cohort) === choice.fingerprint &&
            cohort.schedule?.startAt &&
            new Date(cohort.schedule.startAt) > new Date(),
        "conflict",
        "This class date changed. Refresh before continuing.",
        409,
    );
    return {
        ...choice,
        name: cohort.name,
        startAt: new Date(cohort.schedule.startAt),
        revision: cohort.checkoutRevision || 0,
        cohortDocumentId: String(cohort._id),
    };
}
