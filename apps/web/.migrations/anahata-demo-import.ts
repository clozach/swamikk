import snapshot from "./data/anahata-first-five-2026-09-06.json";
import CourseModel from "@/models/Course";
import type GQLContext from "@/models/GQLContext";
import { createCourse, updateCourse } from "@/graphql/courses/logic";
import { checkIfAuthenticated } from "@/lib/graphql";
import { checkPermission } from "@courselit/utils";
import constants from "@/config/constants";

/** Prepared import only: importing this module does not contact the site or DB. */
export function anahataDemoImportPlan() {
    return snapshot.posts.map((post) => ({
        sourceId: post.wordpressId,
        title: post.title,
        sourceUrl: post.sourceUrl,
        sourcePublishedAt: post.publishedAt,
        rawHtmlSha256: post.rawHtmlSha256,
        sourceTag: `demo:anahata:${post.wordpressId}`,
        featuredImageUrl: post.featuredImageUrl,
        published: false,
    }));
}

/**
 * Root may call this with an existing authenticated admin context after review.
 * Uses the same blog creation/update APIs as the editor. Existing source-tagged
 * imports are skipped; this never overwrites subsequent human edits or publishes.
 * Remote image URLs remain source references; no image is downloaded or uploaded.
 */
export async function importAnahataDemoBlogs(ctx: GQLContext) {
    checkIfAuthenticated(ctx);
    if (
        !checkPermission(ctx.user.permissions, [
            constants.permissions.manageAnyCourse,
            constants.permissions.manageCourse,
        ])
    ) {
        throw new Error(
            "An administrator must apply the prepared blog import.",
        );
    }
    const receipt: {
        sourceId: number;
        courseId: string;
        disposition: "created-draft" | "existing-skipped";
    }[] = [];
    // The normal blog lists newest created records first. Create in reverse so
    // the source's first post remains first without falsifying its source date.
    for (const post of [...snapshot.posts].reverse()) {
        const sourceTag = `demo:anahata:${post.wordpressId}`;
        const existing = await CourseModel.findOne({
            domain: ctx.subdomain._id,
            type: "blog",
            tags: sourceTag,
        });
        if (existing) {
            receipt.push({
                sourceId: post.wordpressId,
                courseId: existing.courseId,
                disposition: "existing-skipped",
            });
            continue;
        }
        const course = await createCourse(
            { title: post.title, type: "blog" },
            ctx,
        );
        try {
            await updateCourse(
                {
                    id: course.courseId,
                    description: JSON.stringify(post.description),
                    tags: [sourceTag, "demo:anahata"],
                },
                ctx,
            );
        } catch (error) {
            throw new Error(
                `Import stopped after creating draft ${course.courseId} for source ${post.wordpressId}. Review that draft before retrying. ${String(error)}`,
            );
        }
        receipt.push({
            sourceId: post.wordpressId,
            courseId: course.courseId,
            disposition: "created-draft",
        });
    }
    return receipt.reverse();
}
