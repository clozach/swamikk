"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
    PageSections,
    RemovableSection,
    SectionEdit,
    SectionEditInput,
} from "@courselit/common-models";
import { sectionEditUi as copy } from "@config/strings";
import { fetchSections, submitSectionEdit } from "./api";

export type SectionState =
    | { kind: "off" }
    | { kind: "loading" }
    | { kind: "failed"; message: string }
    | { kind: "ready"; page: PageSections };
export type SectionPending =
    | { kind: "idle" }
    | { kind: "saving"; widgetId: string; action: "remove" | "restore" };
interface Options {
    onApplied: (edit: SectionEdit) => void;
    onError: (message: string) => void;
    onRefresh?: () => void | Promise<void>;
    beforeChange?: () => boolean | Promise<boolean>;
}

/** Structural operations join the caller's journal; this hook owns no keyboard or undo stack. */
export function useSectionEdit(pageId: string | null, options: Options) {
    const [state, setState] = useState<SectionState>({ kind: "off" });
    const [pending, setPending] = useState<SectionPending>({ kind: "idle" });
    const stateRef = useRef(state);
    const optionsRef = useRef(options);
    const pageRef = useRef(pageId);
    const requestRef = useRef(0);
    const busyRef = useRef(false);
    stateRef.current = state;
    optionsRef.current = options;
    pageRef.current = pageId;

    const refresh = useCallback(async () => {
        const id = pageRef.current;
        if (!id) return null;
        const request = ++requestRef.current;
        try {
            const page = await fetchSections(id);
            if (pageRef.current === id && requestRef.current === request)
                setState({ kind: "ready", page });
            return page;
        } catch (error) {
            if (pageRef.current === id && requestRef.current === request) {
                const message =
                    error instanceof Error ? error.message : copy.failed;
                setState((current) =>
                    current.kind === "ready" && current.page.pageId === id
                        ? current
                        : { kind: "failed", message },
                );
                optionsRef.current.onError(message);
            }
            return null;
        }
    }, []);

    useEffect(() => {
        requestRef.current += 1;
        setState(pageId ? { kind: "loading" } : { kind: "off" });
        if (pageId) void refresh();
        return () => {
            requestRef.current += 1;
        };
    }, [pageId, refresh]);

    const apply = useCallback(
        async (
            input: SectionEditInput,
            widgetId: string,
            action: "remove" | "restore",
            record: boolean,
        ) => {
            const id = pageRef.current;
            if (!id || busyRef.current) return null;
            busyRef.current = true;
            try {
                if (
                    optionsRef.current.beforeChange &&
                    !(await optionsRef.current.beforeChange())
                )
                    return null;
                if (pageRef.current !== id) return null;
                setPending({ kind: "saving", widgetId, action });
                const result = await submitSectionEdit(input);
                if (pageRef.current !== id)
                    return result.kind === "applied" ? result.edit : null;
                if (result.kind === "applied") {
                    // Keep the section hidden while the refreshed React tree catches up.
                    setState((current) =>
                        current.kind !== "ready"
                            ? current
                            : {
                                  kind: "ready",
                                  page: {
                                      ...current.page,
                                      sections:
                                          action === "remove"
                                              ? current.page.sections.filter(
                                                    (section) =>
                                                        section.widgetId !==
                                                        widgetId,
                                                )
                                              : current.page.sections,
                                      removed:
                                          action === "remove"
                                              ? [
                                                    ...current.page.removed.filter(
                                                        (edit) =>
                                                            edit.target
                                                                .widgetId !==
                                                            widgetId,
                                                    ),
                                                    result.edit,
                                                ]
                                              : current.page.removed.filter(
                                                    (edit) =>
                                                        edit.target.widgetId !==
                                                        widgetId,
                                                ),
                                  },
                              },
                    );
                    if (record) optionsRef.current.onApplied(result.edit);
                    await refresh();
                    try {
                        await optionsRef.current.onRefresh?.();
                    } catch {
                        optionsRef.current.onError(copy.uncertain);
                    }
                    return result.edit;
                }
                optionsRef.current.onError(result.message);
                if (result.kind !== "failed") {
                    await refresh();
                    try {
                        await optionsRef.current.onRefresh?.();
                    } catch {
                        optionsRef.current.onError(copy.uncertain);
                    }
                }
                return null;
            } finally {
                busyRef.current = false;
                setPending({ kind: "idle" });
            }
        },
        [refresh],
    );

    const remove = useCallback(
        (section: RemovableSection) => {
            const current = stateRef.current;
            if (
                current.kind !== "ready" ||
                current.page.pageId !== pageRef.current
            )
                return Promise.resolve(null);
            return apply(
                {
                    action: "remove",
                    requestId: crypto.randomUUID(),
                    target: {
                        pageId: current.page.pageId,
                        documentId: current.page.documentId,
                        widgetId: section.widgetId,
                    },
                    fingerprint: section.fingerprint,
                },
                section.widgetId,
                "remove",
                true,
            );
        },
        [apply],
    );
    const reverse = useCallback(
        (edit: SectionEdit) =>
            edit.target.pageId !== pageRef.current
                ? Promise.resolve(null)
                : apply(
                      {
                          action: "reverse",
                          requestId: crypto.randomUUID(),
                          editId: edit.editId,
                      },
                      edit.target.widgetId,
                      edit.action === "remove" ? "restore" : "remove",
                      false,
                  ),
        [apply],
    );
    const restore = useCallback(
        (edit: SectionEdit) => {
            if (
                edit.action !== "remove" ||
                edit.target.pageId !== pageRef.current
            )
                return Promise.resolve(null);
            return apply(
                {
                    action: "reverse",
                    requestId: crypto.randomUUID(),
                    editId: edit.editId,
                },
                edit.target.widgetId,
                "restore",
                true,
            );
        },
        [apply],
    );

    return { state, pending, refresh, remove, reverse, restore };
}
