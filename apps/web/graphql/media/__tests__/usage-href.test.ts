/**
 * @jest-environment node
 */

import { usageHref } from "@courselit/common-logic";

// usageHref turns a referencing document into the dashboard deep-link the
// media library renders. These are the routes the media library links to; if
// a dashboard route moves, this is the canary.
describe("usageHref", () => {
    it("links a course to its product page", () => {
        expect(usageHref("course", { courseId: "c1" })).toBe(
            "/dashboard/product/c1",
        );
    });

    it("links a lesson through course + section to the lesson editor", () => {
        expect(
            usageHref("lesson", {
                lessonId: "l1",
                courseId: "c1",
                groupId: "s1",
            }),
        ).toBe("/dashboard/product/c1/content/section/s1/lesson?id=l1");
    });

    it("links a page to its editor", () => {
        expect(usageHref("page", { pageId: "p1" })).toBe("/dashboard/page/p1");
    });

    it("links a user to their detail page", () => {
        expect(usageHref("user", { userId: "u1" })).toBe("/dashboard/users/u1");
    });

    it("links a community to its dashboard", () => {
        expect(usageHref("community", { communityId: "cm1" })).toBe(
            "/dashboard/community/cm1",
        );
    });

    it("links a post and a comment to the post that holds them", () => {
        const doc = { communityId: "cm1", postId: "po1" };
        expect(usageHref("communityPost", doc)).toBe(
            "/dashboard/community/cm1/po1",
        );
        // A comment has no page of its own — it points at its post.
        expect(
            usageHref("communityComment", { ...doc, commentId: "co1" }),
        ).toBe("/dashboard/community/cm1/po1");
    });

    it("has no link for entity types without a dashboard page", () => {
        expect(usageHref("domain", { name: "acme" })).toBeUndefined();
        expect(
            usageHref("certificateTemplate", { templateId: "t1" }),
        ).toBeUndefined();
        expect(usageHref("somethingNew", { id: "x" })).toBeUndefined();
    });

    it("returns undefined rather than a /undefined link when an id is missing", () => {
        // A lesson missing its course/section would otherwise yield a broken
        // /dashboard/product/undefined/... path.
        expect(usageHref("lesson", { lessonId: "l1" })).toBeUndefined();
        expect(usageHref("course", {})).toBeUndefined();
        expect(
            usageHref("communityPost", { communityId: "cm1" }),
        ).toBeUndefined();
    });
});
