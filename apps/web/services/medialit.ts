"use server";

import { Media } from "@courselit/common-models";
import {
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

export async function listMedia(
    group: string,
    page: number,
    limit: number,
    filters?: { access?: "public" | "private" },
): Promise<Media[]> {
    const medialitClient = getMediaLitClient();
    const media = await medialitClient.list(page, limit, {
        group,
        ...(filters?.access ? { access: filters.access } : {}),
    });
    return media as unknown as Media[];
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

async function protectPendingAttachment(mediaId: string, domain: DomainId) {
    try {
        // The unique domain/mediaId index fences a collector's deleting claim:
        // a competing upsert fails instead of attaching a disappearing asset.
        await MediaDeletionCandidateModel.findOneAndUpdate(
            { domain, mediaId, status: mediaDeletionPending },
            {
                $set: {
                    deleteAfter: new Date(
                        Date.now() + mediaDeletionGracePeriodMs,
                    ),
                    rescheduleRequested: true,
                },
                $setOnInsert: { attempts: 0 },
                $unset: { lastError: 1 },
            },
            { upsert: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code === 11000) {
            throw new Error(
                "This media file is currently being deleted. Retry the operation.",
            );
        }
        throw error;
    }
}

export async function sealMedia(
    mediaId: string,
    domain: DomainId,
): Promise<Media> {
    // Keep cleanup durable across a crash between sealing and the native write.
    // The collector removes this candidate when it finds the saved reference.
    await protectPendingAttachment(mediaId, domain);
    const medialitClient = getMediaLitClient();
    const media = await medialitClient.seal(mediaId);
    return media as unknown as Media;
}
