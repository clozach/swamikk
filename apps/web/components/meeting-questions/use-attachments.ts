"use client";

import { useEffect, useState } from "react";
import type { MeetingQuestionSet } from "@courselit/common-models";

interface Attachment {
    key: string;
    set: MeetingQuestionSet;
    ids: string[];
    element: HTMLElement;
    label: string;
}

/** Attach controls to literal native widget IDs; React still owns every page node. */
export function useAttachments(sets: MeetingQuestionSet[], path: string) {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    useEffect(() => {
        const locate = () => {
            const found = new Map<string, Attachment>();
            for (const set of sets)
                for (const question of set.questions)
                    for (const location of question.locations) {
                        if (location.path !== path) continue;
                        const element =
                            location.componentId === "page"
                                ? document.querySelector<HTMLElement>(
                                      "main, [data-feedback-page]",
                                  )
                                : document.querySelector<HTMLElement>(
                                      `[data-feedback-id="${CSS.escape(location.componentId)}"]`,
                                  );
                        if (
                            !element ||
                            element.closest(
                                "[data-feedback-ui], [data-kk-section-removed], [hidden]",
                            )
                        )
                            continue;
                        const key = `${set.id}:${location.componentId}`;
                        const attachment = found.get(key) || {
                            key,
                            set,
                            ids: [],
                            element,
                            label: location.label,
                        };
                        if (!attachment.ids.includes(question.id))
                            attachment.ids.push(question.id);
                        found.set(key, attachment);
                    }
            const next = Array.from(found.values());
            setAttachments((previous) =>
                previous.length === next.length &&
                previous.every(
                    (item, index) =>
                        item.element === next[index].element &&
                        item.key === next[index].key &&
                        item.set === next[index].set,
                )
                    ? previous
                    : next,
            );
        };
        locate();
        const observer = new MutationObserver(locate);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "data-kk-section-removed",
                "hidden",
                "data-feedback-id",
            ],
        });
        return () => observer.disconnect();
    }, [sets, path]);
    return attachments;
}
