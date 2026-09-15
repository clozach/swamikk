"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { MeetingQuestionsSnapshot } from "@courselit/common-models";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { meetingQuestionsUi as copy } from "@config/strings";
import { useQuestions } from "./use-questions";
import { useAttachments } from "./use-attachments";
import { usePanelFocusReturn } from "@/components/feedback/focus-return";
import QuestionList from "./question-list";

interface OpenQuestions {
    setId: string;
    ids: string[];
    questionId?: string;
}
type PanelChoice =
    | { kind: "idle" }
    | { kind: "open"; selection: OpenQuestions; requestKey: string }
    | { kind: "dismissed"; requestKey: string };
interface PageQuestionsProps {
    data: MeetingQuestionsSnapshot;
    path: string;
    refresh: () => Promise<void>;
    refreshError?: string;
}

export default function ContextualMeetingQuestions() {
    const { state, refresh, permitted } = useQuestions();
    const path = usePathname() || "/";
    if (!permitted || state.kind !== "ready" || path === "/meeting-questions")
        return null;
    return (
        <PageQuestions
            key={`${state.data.viewer.userId}:${path}`}
            data={state.data}
            path={path}
            refresh={refresh}
            refreshError={state.refreshError}
        />
    );
}

function PageQuestions({
    data,
    path,
    refresh,
    refreshError,
}: PageQuestionsProps) {
    const search = useSearchParams();
    const attachments = useAttachments(data.sets, path);
    const [choice, setChoice] = useState<PanelChoice>({ kind: "idle" });
    const setId = search?.get("meeting-set");
    const questionId = search?.get("meeting-question");
    const componentId = search?.get("meeting-component");
    const requestKey = `${setId || ""}:${questionId || ""}:${componentId || ""}`;
    const candidates = questionId
        ? attachments.filter(
              (item) =>
                  (!setId || item.set.id === setId) &&
                  item.ids.includes(questionId) &&
                  (!componentId || item.key.endsWith(`:${componentId}`)),
          )
        : [];
    // Legacy links remain usable only when they identify one set.
    const requested =
        new Set(candidates.map((item) => item.set.id)).size === 1
            ? candidates[0]
            : undefined;
    const open =
        choice.kind === "open" && choice.requestKey === requestKey
            ? choice.selection
            : requested &&
                !(
                    choice.kind === "dismissed" &&
                    choice.requestKey === requestKey
                )
              ? {
                    setId: requested.set.id,
                    ids: requested.ids,
                    questionId: questionId || undefined,
                }
              : null;
    const selected = data.sets.find((set) => set.id === open?.setId);
    const { remember, restore, comment } = usePanelFocusReturn(
        !!open && !!selected,
    );
    const requestedElement = requested?.element;
    const requestedSetId = requested?.set.id;
    useEffect(() => {
        requestedElement?.scrollIntoView({ block: "center" });
        const opener = requestedElement?.querySelector<HTMLElement>(
            `[data-meeting-opener="${CSS.escape(requestedSetId || "")}"]`,
        );
        if (opener) remember(opener);
        // The focus helper writes refs; a new function identity is not a new request.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedElement, requestedSetId, requestKey]);
    useEffect(() => {
        const shortcut = (event: KeyboardEvent) => {
            if (
                !event.altKey ||
                !event.metaKey ||
                event.code !== "KeyQ" ||
                event.repeat ||
                !attachments.length ||
                (event.target instanceof Element &&
                    event.target.closest(
                        "input,textarea,[contenteditable=true]",
                    ))
            )
                return;
            event.preventDefault();
            const first = attachments[0];
            const active = document.activeElement;
            const opener =
                active instanceof HTMLElement && active !== document.body
                    ? active
                    : first.element.querySelector<HTMLElement>(
                          `[data-meeting-opener="${CSS.escape(first.set.id)}"]`,
                      );
            if (opener) remember(opener);
            setChoice({
                kind: "open",
                requestKey,
                selection: { setId: first.set.id, ids: first.ids },
            });
        };
        document.addEventListener("keydown", shortcut);
        return () => document.removeEventListener("keydown", shortcut);
    }, [attachments, requestKey, remember]);
    return (
        <>
            {attachments.map((attachment, index) =>
                createPortal(
                    <aside
                        data-feedback-ui
                        className="relative z-10 mx-auto my-3 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border bg-background px-3 py-2 text-foreground shadow-sm"
                    >
                        <Button
                            ref={index === 0 ? comment : undefined}
                            data-meeting-opener={attachment.set.id}
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="min-h-11 rounded-full"
                            aria-label={`${copy.questions}: ${attachment.label} (${attachment.ids.length})`}
                            aria-keyshortcuts={
                                index === 0 ? "Alt+Meta+Q" : "Enter"
                            }
                            onClick={(event) => {
                                remember(event.currentTarget);
                                setChoice({
                                    kind: "open",
                                    requestKey,
                                    selection: {
                                        setId: attachment.set.id,
                                        ids: attachment.ids,
                                    },
                                });
                            }}
                        >
                            {copy.questions} · {attachment.ids.length}
                            <kbd className="ml-2 text-xs opacity-60">
                                {index === 0 ? "⌥⌘Q" : "↵"}
                            </kbd>
                        </Button>
                        <Link
                            className="px-2 text-sm underline underline-offset-4"
                            href="/meeting-questions"
                        >
                            {copy.all}
                        </Link>
                    </aside>,
                    attachment.element,
                    attachment.key,
                ),
            )}
            <Sheet
                open={!!open && !!selected}
                onOpenChange={(value) => {
                    if (!value) setChoice({ kind: "dismissed", requestKey });
                }}
            >
                <SheetContent
                    data-feedback-ui
                    onCloseAutoFocus={restore}
                    className="flex w-full flex-col overflow-hidden sm:max-w-2xl"
                >
                    <SheetHeader>
                        <SheetTitle>{selected?.title || copy.title}</SheetTitle>
                        <SheetDescription>{copy.here}</SheetDescription>
                    </SheetHeader>
                    {refreshError && (
                        <p role="status" className="text-sm">
                            {refreshError}
                        </p>
                    )}
                    <div className="flex items-center justify-between gap-3 border-b pb-3">
                        <Link
                            href="/meeting-questions"
                            className="text-sm underline"
                        >
                            {copy.all}
                        </Link>
                        <Button variant="ghost" onClick={refresh}>
                            {copy.refresh}
                        </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto pb-8">
                        {selected && open && (
                            <QuestionList
                                key={`${selected.id}:${open.ids.join()}`}
                                set={selected}
                                data={data}
                                questionIds={open.ids}
                                openQuestion={open.questionId}
                                onSaved={refresh}
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
