import { collectReferencedMediaIds } from "@courselit/common-logic";
import {
    InternalMediaDeletionCandidate,
    mediaDeletionGracePeriodMs,
    mediaDeletionInProgress,
    mediaDeletionPending,
} from "@courselit/orm-models";
import { MediaLit } from "medialit";
import MediaDeletionCandidateModel from "./model/media-deletion-candidate";

const claimLeaseMs = 5 * 60 * 1000;
const candidateBatchSize = 100;

export interface MediaCollectionResult {
    deleted: number;
    preserved: number;
    failed: number;
}

export type StorageDelete = (mediaId: string) => Promise<void>;
export type MediaReferenceCollector = (domain: string) => Promise<Set<string>>;

function getMediaLitClient() {
    return new MediaLit({
        apiKey: process.env.MEDIALIT_APIKEY,
        endpoint: process.env.MEDIALIT_SERVER,
    });
}

async function deleteMediaFromStorage(mediaId: string) {
    await getMediaLitClient().delete(mediaId);
}

async function reclaimExpiredClaims(now: Date) {
    await MediaDeletionCandidateModel.updateMany(
        {
            status: mediaDeletionInProgress,
            claimedAt: {
                $lte: new Date(now.getTime() - claimLeaseMs),
            },
        },
        {
            $set: {
                status: mediaDeletionPending,
                deleteAfter: now,
            },
            $unset: { claimedAt: 1 },
        },
    );
}

async function claimDueCandidates(
    now: Date,
): Promise<InternalMediaDeletionCandidate[]> {
    const ids = await MediaDeletionCandidateModel.find({
        status: mediaDeletionPending,
        deleteAfter: { $lte: now },
    })
        .sort({ deleteAfter: 1 })
        .limit(candidateBatchSize)
        .distinct("_id");

    const claimed: InternalMediaDeletionCandidate[] = [];
    for (const id of ids) {
        const candidate = await MediaDeletionCandidateModel.findOneAndUpdate(
            {
                _id: id,
                status: mediaDeletionPending,
                deleteAfter: { $lte: now },
            },
            {
                $set: {
                    status: mediaDeletionInProgress,
                    claimedAt: now,
                    rescheduleRequested: false,
                },
            },
            { new: true },
        ).lean();
        if (candidate) {
            claimed.push(candidate);
        }
    }
    return claimed;
}

function groupByDomain(candidates: InternalMediaDeletionCandidate[]) {
    const grouped = new Map<string, InternalMediaDeletionCandidate[]>();
    for (const candidate of candidates) {
        const domain = String(candidate.domain);
        grouped.set(domain, [...(grouped.get(domain) || []), candidate]);
    }
    return grouped;
}

async function deferRescheduledCandidate(
    candidate: InternalMediaDeletionCandidate,
    now: Date,
): Promise<boolean> {
    const deferred = await MediaDeletionCandidateModel.findOneAndUpdate(
        {
            _id: candidate._id,
            status: mediaDeletionInProgress,
            rescheduleRequested: true,
        },
        {
            $set: {
                status: mediaDeletionPending,
                deleteAfter: new Date(
                    now.getTime() + mediaDeletionGracePeriodMs,
                ),
            },
            $unset: { claimedAt: 1 },
        },
        { new: true },
    ).lean();
    return Boolean(deferred);
}

async function preserveReferencedCandidate(
    candidate: InternalMediaDeletionCandidate,
    now: Date,
) {
    if (await deferRescheduledCandidate(candidate, now)) {
        return;
    }

    await MediaDeletionCandidateModel.deleteOne({
        _id: candidate._id,
        status: mediaDeletionInProgress,
    });
}

async function rescheduleFailedCandidate(
    candidate: InternalMediaDeletionCandidate,
    now: Date,
    error: unknown,
) {
    await MediaDeletionCandidateModel.updateOne(
        { _id: candidate._id, status: mediaDeletionInProgress },
        {
            $set: {
                status: mediaDeletionPending,
                deleteAfter: new Date(
                    now.getTime() + mediaDeletionGracePeriodMs,
                ),
                lastError:
                    error instanceof Error ? error.message : String(error),
            },
            $inc: { attempts: 1 },
            $unset: { claimedAt: 1 },
        },
    );
}

export async function collectDueMediaDeletionCandidates({
    now = new Date(),
    deleteFromStorage = deleteMediaFromStorage,
    collectReferences = collectReferencedMediaIds,
}: {
    now?: Date;
    deleteFromStorage?: StorageDelete;
    collectReferences?: MediaReferenceCollector;
} = {}): Promise<MediaCollectionResult> {
    await reclaimExpiredClaims(now);
    const candidates = await claimDueCandidates(now);
    const result: MediaCollectionResult = {
        deleted: 0,
        preserved: 0,
        failed: 0,
    };

    for (const [domain, domainCandidates] of groupByDomain(candidates)) {
        let referencedMediaIds: Set<string>;
        try {
            referencedMediaIds = await collectReferences(domain);
        } catch (error) {
            for (const candidate of domainCandidates) {
                await rescheduleFailedCandidate(candidate, now, error);
                result.failed += 1;
            }
            continue;
        }

        for (const candidate of domainCandidates) {
            if (referencedMediaIds.has(candidate.mediaId)) {
                await preserveReferencedCandidate(candidate, now);
                result.preserved += 1;
                continue;
            }

            // A last-reference deletion can race with an older candidate's
            // collection pass. Honor the newer request's full grace period.
            if (await deferRescheduledCandidate(candidate, now)) {
                result.preserved += 1;
                continue;
            }

            try {
                await deleteFromStorage(candidate.mediaId);
                await MediaDeletionCandidateModel.deleteOne({
                    _id: candidate._id,
                    status: mediaDeletionInProgress,
                });
                result.deleted += 1;
            } catch (error) {
                await rescheduleFailedCandidate(candidate, now, error);
                result.failed += 1;
            }
        }
    }

    return result;
}
