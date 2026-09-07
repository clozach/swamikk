import Course from "@/models/Course";
import Plan from "@/models/PaymentPlan";
import { requireCondition } from "@/services/content-changes/errors";
import type { Cohort } from "@courselit/common-models";

export async function validateClassListing(
    domain: string,
    cohort: Pick<Cohort, "courseId" | "name" | "schedule" | "checkoutState">,
    previousState = "private",
) {
    const state = cohort.checkoutState || "private";
    requireCondition(
        ["private", "listed-closed", "listed-open"].includes(state),
        "bad_request",
        "Choose a valid class listing state.",
    );
    requireCondition(
        previousState === "private" || state !== "private",
        "conflict",
        "A listed class can be closed, but cannot become an internal roster. Close it to stop new bookings.",
        409,
    );
    if (state === "private") return;
    requireCondition(
        cohort.name.trim().length > 0 && cohort.name.length <= 180,
        "bad_request",
        "Use a class name between 1 and 180 characters.",
    );
    if (state !== "listed-open") return;
    const start = cohort.schedule?.startAt && new Date(cohort.schedule.startAt);
    requireCondition(
        start && Number.isFinite(start.getTime()) && start > new Date(),
        "bad_request",
        "Set a future class start before opening bookings.",
    );
    const [course, plan] = await Promise.all([
        Course.exists({ domain, courseId: cohort.courseId, published: true }),
        Plan.exists({
            domain,
            entityId: cohort.courseId,
            entityType: "course",
            type: "onetime",
            archived: false,
            internal: { $ne: true },
            oneTimeAmount: { $gt: 0 },
        }),
    ]);
    requireCondition(
        course && plan,
        "bad_request",
        "Publish the course and add a one-time paid plan before opening class bookings.",
    );
}
