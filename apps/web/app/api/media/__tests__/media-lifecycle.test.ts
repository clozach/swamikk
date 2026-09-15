/**
 * @jest-environment node
 */

import mongoose from "mongoose";
import {
    mediaDeletionGracePeriodMs,
    mediaDeletionInProgress,
    mediaDeletionPending,
} from "@courselit/orm-models";
import MediaDeletionCandidateModel from "@models/MediaDeletionCandidate";
import { deleteMedia, sealMedia } from "@/services/medialit";
import { MediaLit } from "medialit";

jest.mock("medialit", () => ({
    MediaLit: jest.fn(),
}));

const now = new Date("2026-07-18T12:00:00.000Z");
const seal = jest.fn();

describe("media lifecycle service", () => {
    beforeEach(async () => {
        await MediaDeletionCandidateModel.init();
        jest.mocked(MediaLit).mockImplementation(
            () => ({ seal }) as unknown as InstanceType<typeof MediaLit>,
        );
        seal.mockResolvedValue({ mediaId: "media-1" });
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await MediaDeletionCandidateModel.deleteMany({});
    });

    it("schedules physical deletion 24 hours after the request", async () => {
        const domain = new mongoose.Types.ObjectId();
        const beforeScheduling = Date.now();

        await deleteMedia("media-1", domain);
        const afterScheduling = Date.now();

        const candidate = await MediaDeletionCandidateModel.findOne().lean();
        expect(candidate).toMatchObject({
            domain,
            mediaId: "media-1",
            status: mediaDeletionPending,
        });
        expect(candidate!.deleteAfter.getTime()).toBeGreaterThanOrEqual(
            beforeScheduling + mediaDeletionGracePeriodMs,
        );
        expect(candidate!.deleteAfter.getTime()).toBeLessThanOrEqual(
            afterScheduling + mediaDeletionGracePeriodMs,
        );
    });

    it("retains a deferred candidate across seal until a native reference exists", async () => {
        const domain = new mongoose.Types.ObjectId();
        await deleteMedia("media-1", domain);

        await sealMedia("media-1", domain);

        expect(
            await MediaDeletionCandidateModel.findOne().lean(),
        ).toMatchObject({
            domain,
            mediaId: "media-1",
            status: mediaDeletionPending,
            rescheduleRequested: true,
        });
        expect(seal).toHaveBeenCalledWith("media-1");
    });

    it("records cleanup before sealing an upload without an earlier candidate", async () => {
        const domain = new mongoose.Types.ObjectId();
        seal.mockImplementationOnce(async () => {
            expect(
                await MediaDeletionCandidateModel.findOne().lean(),
            ).toMatchObject({
                domain,
                mediaId: "media-1",
                status: mediaDeletionPending,
            });
            throw new Error("Storage failed after making the upload permanent");
        });
        await expect(sealMedia("media-1", domain)).rejects.toThrow(
            "Storage failed",
        );
        expect(await MediaDeletionCandidateModel.countDocuments()).toBe(1);
    });

    it("moves an overdue candidate out of the collector's due window before sealing", async () => {
        const domain = new mongoose.Types.ObjectId();
        await MediaDeletionCandidateModel.create({
            domain,
            mediaId: "media-1",
            deleteAfter: now,
            status: mediaDeletionPending,
        });
        const before = Date.now();
        await sealMedia("media-1", domain);
        const candidate = await MediaDeletionCandidateModel.findOne().lean();
        expect(candidate!.deleteAfter.getTime()).toBeGreaterThanOrEqual(
            before + mediaDeletionGracePeriodMs,
        );
        expect(await MediaDeletionCandidateModel.countDocuments()).toBe(1);
    });

    it("blocks a new attachment while physical deletion is in progress", async () => {
        const domain = new mongoose.Types.ObjectId();
        await MediaDeletionCandidateModel.create({
            domain,
            mediaId: "media-1",
            deleteAfter: now,
            status: mediaDeletionInProgress,
            claimedAt: now,
            rescheduleRequested: false,
        });

        await expect(sealMedia("media-1", domain)).rejects.toThrow(
            "currently being deleted",
        );
        expect(seal).not.toHaveBeenCalled();
    });
});
