"use server";

import { Media } from "@courselit/common-models";
import {
    mediaDeletionInProgress,
    mediaDeletionGracePeriodMs,
    mediaDeletionPending,
} from "@courselit/orm-models";
import { MediaLit } from "medialit";
import mongoose from "mongoose";
import MediaDeletionCandidateModel from "@models/MediaDeletionCandidate";

type DomainId = mongoose.Types.ObjectId | string;

function getMediaLitClient() {
    const medialit = new MediaLit({
        apiKey: process.env.MEDIALIT_APIKEY,
        endpoint: process.env.MEDIALIT_SERVER,
    });

    return medialit;
}

export async function getMedia(mediaId: string): Promise<Media> {
    const medialitClient = getMediaLitClient();
    const media = await medialitClient.get(mediaId);
    return media as unknown as Media;
}

export async function getPresignedUrlForUpload(
    domain: string,
): Promise<string> {
    const medialitClient = getMediaLitClient();
    const url = await medialitClient.getSignature({
        group: domain,
    });
    return url;
}

export async function deleteMedia(
    mediaId: string,
    domain: DomainId,
): Promise<boolean> {
    const deleteAfter = new Date(Date.now() + mediaDeletionGracePeriodMs);
    await MediaDeletionCandidateModel.findOneAndUpdate(
        { domain, mediaId },
        {
            $set: {
                deleteAfter,
                rescheduleRequested: true,
            },
            $setOnInsert: {
                status: mediaDeletionPending,
                attempts: 0,
            },
            $unset: { lastError: 1 },
        },
        { upsert: true },
    );
    return true;
}

async function cancelScheduledMediaDeletion(mediaId: string, domain: DomainId) {
    const removed = await MediaDeletionCandidateModel.findOneAndDelete({
        domain,
        mediaId,
        status: mediaDeletionPending,
    });
    if (removed) {
        return;
    }

    const deletionInProgress = await MediaDeletionCandidateModel.exists({
        domain,
        mediaId,
        status: mediaDeletionInProgress,
    });
    if (deletionInProgress) {
        throw new Error(
            "This media file is currently being deleted. Retry the operation.",
        );
    }
}

export async function sealMedia(
    mediaId: string,
    domain: DomainId,
): Promise<Media> {
    await cancelScheduledMediaDeletion(mediaId, domain);
    const medialitClient = getMediaLitClient();
    const media = await medialitClient.seal(mediaId);
    return media as unknown as Media;
}
