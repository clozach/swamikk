"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
    createSectionSlots,
    type SectionSlot,
    type SectionSlotInput,
} from "./slots";

/** Reattach our sibling portals after the page replaces its own React nodes. */
export function useSectionSlots(
    enabled: boolean,
    pageId: string,
    items: SectionSlotInput[],
) {
    const [slots, setSlots] = useState<SectionSlot[]>([]);
    const managerRef = useRef<ReturnType<typeof createSectionSlots> | null>(
        null,
    );
    const itemsRef = useRef(items);
    useLayoutEffect(() => {
        itemsRef.current = items;
    }, [items]);
    const update = (next: SectionSlot[]) =>
        setSlots((current) =>
            current.length === next.length &&
            current.every((slot, index) => slot.host === next[index].host)
                ? current
                : next,
        );

    useLayoutEffect(() => {
        if (!enabled) return;
        const manager = createSectionSlots(pageId);
        managerRef.current = manager;
        const sync = () => {
            update(manager.sync(itemsRef.current));
            observer.takeRecords();
        };
        const observer = new MutationObserver(sync);
        observer.observe(document.body, { childList: true, subtree: true });
        sync();
        return () => {
            observer.disconnect();
            manager.dispose();
            managerRef.current = null;
        };
    }, [enabled, pageId]);

    useLayoutEffect(() => {
        if (enabled && managerRef.current)
            update(managerRef.current.sync(items));
    }, [enabled, items]);

    return slots;
}
