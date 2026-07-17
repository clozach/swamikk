import { collectDueMediaDeletionCandidates } from "./collect-media-deletion-candidates";
import { logger } from "../logger";
import { captureError, getDomainId } from "../observability/posthog";

const pollIntervalMs = 60 * 1000;

export async function processMediaDeletionCandidates() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            await collectDueMediaDeletionCandidates();
        } catch (error) {
            logger.error(error);
            captureError({
                error,
                source: "processMediaDeletionCandidates.loop",
                domainId: getDomainId(),
            });
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
}
