"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { purchaseRemovalUi as copy } from "@/config/strings";
import type { PurchaseRemoval } from "../../../../packages/common-models/src/purchase-removal";

export default function PurchaseRemovalControl({
    removal,
    onRemove,
}: {
    removal?: PurchaseRemoval;
    onRemove: () => void;
}) {
    if (removal?.kind !== "allowed")
        return (
            <span className="inline-block max-w-52 text-xs text-muted-foreground">
                {removal?.kind === "blocked"
                    ? copy.reasons[removal.reason] || copy.unavailable
                    : copy.unavailable}
            </span>
        );
    return (
        <Button
            variant="ghost"
            size="icon"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            aria-label={copy.remove}
            title={copy.remove}
            onClick={onRemove}
        >
            <X className="h-4 w-4" />
        </Button>
    );
}
