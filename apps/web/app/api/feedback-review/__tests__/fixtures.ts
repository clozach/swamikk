import { randomUUID } from "crypto";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import PageModel from "@/models/Page";
import { FeedbackModel } from "@/services/content-changes/models";
import { issueGrant } from "@/services/feedback-review/grants";
import { withReviewer } from "@/services/feedback-review/authority";
import { claimReview } from "@/services/feedback-review/claim";
import { readReviewContext } from "@/services/feedback-review/leases";
import { submitReviewResult } from "@/services/feedback-review/results";
import type { FeedbackReviewResult } from "@courselit/common-models";
export const doc = (text: string) => ({
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
export const proposal: FeedbackReviewResult = {
    kind: "text-proposal",
    summary: "Clarify this sentence",
    replacement: { kind: "rich-text", content: doc("Clear public words") },
};
export const escalation: FeedbackReviewResult = {
    kind: "escalation",
    reason: "human-review",
    summary: "Please review this comment personally.",
};
export async function fixture() {
    const id = randomUUID();
    const domain = await DomainModel.create({
        name: `review-${id}`,
        email: `${id}@example.com`,
        sharedWidgets: {},
        draftSharedWidgets: {},
        typefaces: [],
        draftTypefaces: [],
    });
    const user = await UserModel.create({
        domain: domain._id,
        userId: `admin-${id}`,
        email: domain.email,
        active: true,
        permissions: ["setting:manage", "site:manage", "course:manage_any"],
        unsubscribeToken: id,
    });
    const member = await UserModel.create({
        domain: domain._id,
        userId: `member-${id}`,
        email: `member-${id}@example.com`,
        active: true,
        permissions: [],
        unsubscribeToken: `member-${id}`,
    });
    const page = await PageModel.create({
        domain: domain._id,
        pageId: "welcome",
        type: "site",
        name: "Welcome",
        creatorId: user.userId,
        layout: [
            {
                widgetId: "copy",
                name: "rich-text",
                settings: { text: doc("Public words") },
            },
        ],
        draftLayout: [],
    });
    const ctx = { user, subdomain: domain } as any;
    const { grant, token } = await issueGrant(
        {
            name: "Isolated reviewer",
            scopes: ["public-page-text", "public-lesson-text"],
            expiresInDays: 1,
        },
        ctx,
    );
    const feedback = await FeedbackModel.create({
        domain: domain._id,
        id: randomUUID(),
        text: "Please clarify the words",
        target: { kind: "page", path: "/p/welcome", componentId: "#copy" },
        actor: { kind: "member", userId: member.userId },
        photoMediaIds: [],
        state: "open",
    });
    const run = <T>(fn: Parameters<typeof withReviewer<T>>[3]) =>
        withReviewer(String(domain._id), token, "test", fn);
    const claim = async () => {
        const result = await run(claimReview);
        if (!("claim" in result) || !result.claim)
            throw new Error("Expected claim");
        return result.claim;
    };
    return {
        domain,
        user,
        member,
        page,
        ctx,
        grant,
        token,
        feedback,
        use: run,
        claim,
        context: (input: Awaited<ReturnType<typeof claim>>) =>
            run((authority) => readReviewContext(input, authority)),
        result: (input: Awaited<ReturnType<typeof claim>>, result = proposal) =>
            run((authority) =>
                submitReviewResult({ ...input, result }, authority),
            ),
    };
}
