/** @jest-environment node */
import mongoose from "mongoose";
import {
    collectReferencedMediaIds,
    collectMediaUsage,
    collectMediaIdsFromValue,
    usageHref,
} from "@courselit/common-logic";
import { FeedbackSchema, ContentChangeSchema } from "@courselit/orm-models";

const Feedback =
    mongoose.models.ContextualFeedback ||
    mongoose.model("ContextualFeedback", FeedbackSchema);
const Change =
    mongoose.models.ContentChange ||
    mongoose.model("ContentChange", ContentChangeSchema);
const domain = new mongoose.Types.ObjectId();
const otherDomain = new mongoose.Types.ObjectId();

afterEach(async () => {
    await Feedback.deleteMany({ domain: { $in: [domain, otherDomain] } });
    await Change.deleteMany({ domain: { $in: [domain, otherDomain] } });
});

it("keeps admin photos, proposed content and recovery history while excluding another tenant", async () => {
    await Feedback.collection.insertMany([
        {
            domain,
            id: "feedback-1",
            text: "Replace this photo",
            photoMediaIds: ["feedback-photo"],
        },
        {
            domain: otherDomain,
            id: "feedback-other",
            text: "Other school",
            photoMediaIds: ["other-photo"],
        },
    ]);
    await Change.collection.insertMany([
        {
            domain,
            id: "change-1",
            summary: "Review lesson images",
            baseline: { snapshot: { content: { mediaId: "baseline-image" } } },
            patch: { content: { mediaId: "proposed-image" } },
            preview: { after: { mediaId: "preview-image" } },
            history: [
                { baseline: { snapshot: { mediaId: "recovery-image" } } },
            ],
        },
        {
            domain: otherDomain,
            id: "change-other",
            summary: "Other school",
            history: [{ mediaId: "other-recovery" }],
        },
    ]);
    const references = await collectReferencedMediaIds(domain);
    expect(references).toEqual(
        new Set([
            "feedback-photo",
            "baseline-image",
            "proposed-image",
            "preview-image",
            "recovery-image",
        ]),
    );
    const usage = await collectMediaUsage(domain);
    expect(usage.get("feedback-photo")).toEqual([
        {
            entityType: "contextualFeedback",
            entityId: "feedback-1",
            title: "Replace this photo",
            href: "/dashboard/changes",
        },
    ]);
    expect(usage.get("recovery-image")?.[0]).toMatchObject({
        entityType: "contentChange",
        entityId: "change-1",
        href: "/dashboard/changes",
    });
    expect(usage.has("other-photo")).toBe(false);
    expect(usage.has("other-recovery")).toBe(false);
});

it("recognizes only the explicit photo ID array and links to a trusted admin route", () => {
    expect(
        collectMediaIdsFromValue({
            photoMediaIds: ["photo", "", null, 7],
            text: "some unrelated ID",
        }),
    ).toEqual(new Set(["photo"]));
    expect(
        usageHref("contextualFeedback", {
            target: { url: "https://attacker.invalid" },
        }),
    ).toBe("/dashboard/changes");
    expect(usageHref("contentChange", { id: "../../anything" })).toBe(
        "/dashboard/changes",
    );
});
