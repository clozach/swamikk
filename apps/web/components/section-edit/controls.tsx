"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Undo2, X } from "lucide-react";
import type {
    PageSections,
    RemovableSection,
    SectionEdit,
} from "@courselit/common-models";
import { sectionEditUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import { Shortcut } from "@/components/feedback/shortcut";
import type { SectionSlotInput } from "./slots";
import { useSectionSlots } from "./use-section-slots";
import type { SectionPending } from "./use-section-edit";
import "./section-edit.css";

interface Props {
    enabled: boolean;
    page: PageSections;
    pending: SectionPending;
    disabled?: boolean;
    onRemove: (section: RemovableSection) => unknown;
    onRestore: (edit: SectionEdit) => unknown;
}

/** Visible pointer controls share edit mode; removal leaves a lasting way back in its place. */
export function SectionControls({
    enabled,
    page,
    pending,
    disabled = false,
    onRemove,
    onRestore,
}: Props) {
    const focusRef = useRef<string | null>(null);
    const items = useMemo<SectionSlotInput[]>(
        () => [
            ...page.sections.map((section, index) => ({
                widgetId: section.widgetId,
                removed:
                    pending.kind === "saving" &&
                    pending.action === "remove" &&
                    pending.widgetId === section.widgetId,
                position: {
                    index: section.index,
                    beforeId: page.sections[index - 1]?.widgetId || null,
                    afterId: page.sections[index + 1]?.widgetId || null,
                },
            })),
            ...page.removed.map((edit) => ({
                widgetId: edit.target.widgetId,
                removed: true,
                position: edit.position,
            })),
        ],
        [page, pending],
    );
    const slots = useSectionSlots(enabled, page.pageId, items);

    useLayoutEffect(() => {
        if (!enabled || !focusRef.current) return;
        const host = slots.find(
            (slot) => slot.widgetId === focusRef.current,
        )?.host;
        if (!host) return;
        const button = host.querySelector<HTMLButtonElement>(
            "button:not(:disabled)",
        );
        if (button) {
            button.focus({ preventScroll: true });
            if (pending.kind === "idle") focusRef.current = null;
        } else {
            host.tabIndex = -1;
            host.focus({ preventScroll: true });
        }
    }, [enabled, slots, pending, page]);

    if (!enabled) return null;
    const busy = pending.kind !== "idle" || disabled;
    return (
        <>
            {slots.map(({ widgetId, host }) => {
                const section = page.sections.find(
                    (item) => item.widgetId === widgetId,
                );
                const edit = page.removed.find(
                    (item) => item.target.widgetId === widgetId,
                );
                const removing =
                    pending.kind === "saving" &&
                    pending.widgetId === widgetId &&
                    pending.action === "remove";
                const restoring =
                    pending.kind === "saving" &&
                    pending.widgetId === widgetId &&
                    pending.action === "restore";
                if (edit || removing)
                    return createPortal(
                        <div
                            className="kk-section-removed"
                            data-kk-removed-section={widgetId}
                        >
                            <span role="status">
                                {copy.removed.replace(
                                    "{name}",
                                    edit?.label || section?.label || "",
                                )}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy || !edit}
                                aria-keyshortcuts="Enter"
                                onClick={() => {
                                    if (!edit) return;
                                    focusRef.current = widgetId;
                                    void onRestore(edit);
                                }}
                            >
                                <Undo2 size={16} aria-hidden="true" />
                                {removing
                                    ? copy.saving
                                    : restoring
                                      ? copy.restoring
                                      : copy.undo}
                                {!removing && !restoring && (
                                    <Shortcut>{copy.activateShortcut}</Shortcut>
                                )}
                            </Button>
                        </div>,
                        host,
                        widgetId,
                    );
                if (!section) return null;
                const label = copy.remove.replace("{name}", section.label);
                return createPortal(
                    <button
                        type="button"
                        className="kk-section-remove"
                        data-kk-remove-section={widgetId}
                        disabled={busy}
                        aria-label={label}
                        aria-keyshortcuts="Enter"
                        title={label}
                        onClick={() => {
                            focusRef.current = widgetId;
                            void onRemove(section);
                        }}
                    >
                        <X size={20} aria-hidden="true" />
                        <Shortcut>{copy.activateShortcut}</Shortcut>
                    </button>,
                    host,
                    widgetId,
                );
            })}
        </>
    );
}

export const SectionEditControls = SectionControls;
