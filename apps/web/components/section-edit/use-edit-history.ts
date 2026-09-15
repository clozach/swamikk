"use client";

import { useCallback, useRef, useState } from "react";

/** One ordered journal for text and structural edits. A failed reversal never
 * consumes its entry; synchronous locking also contains held-key repeats. */
export function useEditHistory<T extends { editId: string }>(
    reverse: (edit: T) => Promise<T | null>,
) {
    const [stacks, setStacks] = useState<{ undo: T[]; redo: T[] }>({
        undo: [],
        redo: [],
    });
    const [pending, setPending] = useState(false);
    const current = useRef(stacks);
    const locked = useRef(false);
    const reverseRef = useRef(reverse);
    reverseRef.current = reverse;

    const update = useCallback((next: { undo: T[]; redo: T[] }) => {
        current.current = next;
        setStacks(next);
    }, []);

    const record = useCallback(
        (edit: T) => {
            update({ undo: [...current.current.undo, edit], redo: [] });
        },
        [update],
    );

    const reverseEntry = useCallback(
        async (edit: T, lane?: "undo" | "redo") => {
            if (locked.current) return null;
            locked.current = true;
            setPending(true);
            try {
                const from =
                    lane ??
                    (current.current.undo.some(
                        (item) => item.editId === edit.editId,
                    )
                        ? "undo"
                        : "redo");
                const result = await reverseRef.current(edit);
                if (!result) return null;
                const next = {
                    undo: current.current.undo.filter(
                        (item) => item.editId !== edit.editId,
                    ),
                    redo: current.current.redo.filter(
                        (item) => item.editId !== edit.editId,
                    ),
                };
                next[from === "undo" ? "redo" : "undo"].push(result);
                update(next);
                return result;
            } finally {
                locked.current = false;
                setPending(false);
            }
        },
        [update],
    );

    const undo = useCallback(async () => {
        const stack = current.current.undo;
        return stack.length
            ? reverseEntry(stack[stack.length - 1], "undo")
            : null;
    }, [reverseEntry]);
    const redo = useCallback(async () => {
        const stack = current.current.redo;
        return stack.length
            ? reverseEntry(stack[stack.length - 1], "redo")
            : null;
    }, [reverseEntry]);

    return {
        record,
        reverseEntry,
        undo,
        redo,
        pending,
        canUndo: !pending && stacks.undo.length > 0,
        canRedo: !pending && stacks.redo.length > 0,
    };
}
