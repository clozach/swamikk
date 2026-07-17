/**
 * @jest-environment node
 */

import mongoose from "mongoose";
import { mediaDeletionPending } from "@courselit/orm-models";
import MediaDeletionCandidateModel from "../model/media-deletion-candidate";
import { collectDueMediaDeletionCandidates } from "../collect-media-deletion-candidates";

jest.mock(
    "medialit",
    () => ({
        MediaLit: jest.fn(),
    }),
    { virtual: true },
);

const now = new Date("2026-07-18T12:00:00.000Z");

async function addDueCandidate(
    domain: mongoose.Types.ObjectId,
    mediaId: string,
) {
    await MediaDeletionCandidateModel.create({
        domain,
        mediaId,
        deleteAfter: new Date(now.getTime() - 1),
        status: mediaDeletionPending,
        rescheduleRequested: true,
    });
}

describe("media deletion collection", () => {
    afterEach(async () => {
        for (const collection of Object.values(
            mongoose.connection.collections,
        )) {
            await collection.deleteMany({});
        }
        jest.restoreAllMocks();
    });

    it("preserves a shared binary while either course still references it", async () => {
        const domain = new mongoose.Types.ObjectId();
        const mediaId = "shared-course-media";
        await mongoose.connection.collection("courses").insertMany([
            {
                domain,
                courseId: "source-course",
                featuredImage: { mediaId },
            },
            {
                domain,
                courseId: "cloned-course",
                featuredImage: { mediaId },
            },
        ]);
        await addDueCandidate(domain, mediaId);
        const deleteFromStorage = jest.fn().mockResolvedValue(undefined);

        const result = await collectDueMediaDeletionCandidates({
            now,
            deleteFromStorage,
        });

        expect(result).toEqual({ deleted: 0, preserved: 1, failed: 0 });
        expect(deleteFromStorage).not.toHaveBeenCalled();
        expect(await MediaDeletionCandidateModel.countDocuments()).toBe(0);
    });

    it("deletes the binary after its final database reference disappears", async () => {
        const domain = new mongoose.Types.ObjectId();
        const mediaId = "last-reference-media";
        await mongoose.connection.collection("lessons").insertOne({
            domain,
            lessonId: "last-reference-lesson",
            media: { mediaId },
        });
        await mongoose.connection.collection("lessons").deleteOne({
            domain,
            lessonId: "last-reference-lesson",
        });
        await addDueCandidate(domain, mediaId);
        const deleteFromStorage = jest.fn().mockResolvedValue(undefined);

        const result = await collectDueMediaDeletionCandidates({
            now,
            deleteFromStorage,
        });

        expect(result).toEqual({ deleted: 1, preserved: 0, failed: 0 });
        expect(deleteFromStorage).toHaveBeenCalledWith(mediaId);
        expect(await MediaDeletionCandidateModel.countDocuments()).toBe(0);
    });

    it("recognizes a media URL nested inside a page layout", async () => {
        const domain = new mongoose.Types.ObjectId();
        const mediaId = "nested-page-media";
        await mongoose.connection.collection("pages").insertOne({
            domain,
            pageId: "page-with-media",
            layout: [
                {
                    settings: {
                        source: `https://media.example/${mediaId}/main.png`,
                    },
                },
            ],
        });
        await addDueCandidate(domain, mediaId);
        const deleteFromStorage = jest.fn().mockResolvedValue(undefined);

        const result = await collectDueMediaDeletionCandidates({
            now,
            deleteFromStorage,
        });

        expect(result.preserved).toBe(1);
        expect(deleteFromStorage).not.toHaveBeenCalled();
    });

    it("does not collect candidates before the 24-hour deadline", async () => {
        const domain = new mongoose.Types.ObjectId();
        await MediaDeletionCandidateModel.create({
            domain,
            mediaId: "not-due-media",
            deleteAfter: new Date(now.getTime() + 1),
            status: mediaDeletionPending,
            rescheduleRequested: true,
        });
        const deleteFromStorage = jest.fn().mockResolvedValue(undefined);

        const result = await collectDueMediaDeletionCandidates({
            now,
            deleteFromStorage,
        });

        expect(result).toEqual({ deleted: 0, preserved: 0, failed: 0 });
        expect(deleteFromStorage).not.toHaveBeenCalled();
        expect(await MediaDeletionCandidateModel.countDocuments()).toBe(1);
    });

    it("restarts the grace period when the last reference is removed during collection", async () => {
        const domain = new mongoose.Types.ObjectId();
        const mediaId = "racing-last-reference";
        await addDueCandidate(domain, mediaId);
        const deleteFromStorage = jest.fn().mockResolvedValue(undefined);
        const collectReferences = jest.fn(async () => {
            await MediaDeletionCandidateModel.updateOne(
                { domain, mediaId },
                { $set: { rescheduleRequested: true } },
            );
            return new Set<string>();
        });

        const result = await collectDueMediaDeletionCandidates({
            now,
            deleteFromStorage,
            collectReferences,
        });

        expect(result).toEqual({ deleted: 0, preserved: 1, failed: 0 });
        expect(deleteFromStorage).not.toHaveBeenCalled();
        expect(
            await MediaDeletionCandidateModel.findOne().lean(),
        ).toMatchObject({
            status: mediaDeletionPending,
            deleteAfter: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        });
    });

    it("reschedules a transient MediaLit deletion failure", async () => {
        const domain = new mongoose.Types.ObjectId();
        await addDueCandidate(domain, "retry-media");
        const deleteFromStorage = jest
            .fn()
            .mockRejectedValue(new Error("storage unavailable"));

        const result = await collectDueMediaDeletionCandidates({
            now,
            deleteFromStorage,
        });

        expect(result).toEqual({ deleted: 0, preserved: 0, failed: 1 });
        const candidate = await MediaDeletionCandidateModel.findOne().lean();
        expect(candidate).toMatchObject({
            status: mediaDeletionPending,
            attempts: 1,
            lastError: "storage unavailable",
            deleteAfter: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        });
    });
});
