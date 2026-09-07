import type {
    ContentChange,
    ContentChangeState,
} from "@courselit/common-models";
import type { InternalContentChange } from "@courselit/orm-models";
import { ContentChangeModel } from "./models";
import { changeView } from "./proposals";
import { requireCondition } from "./errors";
export async function settle(
    record: InternalContentChange,
    state: ContentChangeState,
    keepLock = false,
): Promise<ContentChange> {
    const current = record.state;
    requireCondition(
        current.kind === "applying" || current.kind === "uncertain",
        "conflict",
        "This operation has already been settled.",
        409,
    );
    const saved = await ContentChangeModel.findOneAndUpdate(
        {
            domain: record.domain,
            id: record.id,
            version: record.version,
            "state.operationId": current.operationId,
            "state.kind": { $in: ["applying", "uncertain"] },
        },
        {
            $set: { state },
            ...(keepLock ? {} : { $unset: { activeTarget: 1 } }),
        },
        { new: true },
    );
    if (saved) return changeView(saved);
    const latest = await ContentChangeModel.findOne({
        domain: record.domain,
        id: record.id,
    });
    requireCondition(latest, "not_found", "Content proposal not found.", 404);
    return changeView(latest);
}
