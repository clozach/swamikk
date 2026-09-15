"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type {
    MeetingQuestionAnswer,
    MeetingQuestionsSnapshot,
} from "@courselit/common-models";
import { Button } from "@/components/ui/button";
import { meetingQuestionsUi as copy } from "@config/strings";
import { saveMeetingAnswer } from "./api";

interface AnswerProps {
    setId: string;
    questionId: string;
    answers: MeetingQuestionAnswer[];
    viewer: MeetingQuestionsSnapshot["viewer"];
    onSaved: () => Promise<void>;
}
type SaveState =
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; refreshFailed?: boolean }
    | { kind: "error"; message: string }
    | { kind: "conflict"; current: MeetingQuestionAnswer | null };
const draftSchema = z.object({
    version: z.literal(1),
    text: z.string().max(4000),
    base: z.object({
        revision: z.number().int().nonnegative(),
        text: z.string().max(4000),
    }),
    attempt: z
        .object({
            text: z.string().max(4000),
            expectedRevision: z.number().int().nonnegative(),
            mutationId: z.string().min(1).max(100),
        })
        .nullable(),
});
type Draft = z.infer<typeof draftSchema>;
const answerSchema = z.object({ text: z.string().max(4000, copy.tooLong) });
const fallbackDrafts = new Map<string, Draft>();
const baseOf = (answer?: MeetingQuestionAnswer | null) => ({
    revision: answer?.revision || 0,
    text: answer?.text || "",
});
function readDraft(key: string, answer?: MeetingQuestionAnswer): Draft {
    const retained = fallbackDrafts.get(key);
    if (retained) return retained;
    try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
            const parsed = draftSchema.safeParse(JSON.parse(raw));
            if (parsed.success) return parsed.data;
        }
    } catch {
        const fallback = fallbackDrafts.get(key);
        if (fallback) return fallback;
    }
    return {
        version: 1,
        text: answer?.text || "",
        base: baseOf(answer),
        attempt: null,
    };
}
function retainDraft(key: string, draft: Draft) {
    const keep = draft.text !== draft.base.text || draft.attempt !== null;
    try {
        if (keep) sessionStorage.setItem(key, JSON.stringify(draft));
        else sessionStorage.removeItem(key);
        fallbackDrafts.delete(key);
    } catch {
        if (keep) fallbackDrafts.set(key, draft);
        else fallbackDrafts.delete(key);
    }
}

export default function MeetingAnswer(props: AnswerProps) {
    // Reset all component state synchronously when its owner/question changes.
    return (
        <AnswerEditor
            key={`${props.viewer.userId}:${props.setId}:${props.questionId}`}
            {...props}
        />
    );
}

function AnswerEditor({
    setId,
    questionId,
    answers,
    viewer,
    onSaved,
}: AnswerProps) {
    const mine = answers.find(
        (answer) =>
            answer.author.kind === "account" &&
            answer.author.userId === viewer.userId,
    );
    const storageKey = `meeting-answer:v1:${viewer.userId}:${setId}:${questionId}`;
    const [draft, setDraft] = useState(() => readDraft(storageKey, mine));
    const form = useForm<{ text: string }>({
        resolver: zodResolver(answerSchema),
        values: { text: draft.text },
    });
    const current = useRef(draft);
    const [saved, setSaved] = useState<MeetingQuestionAnswer>();
    const latest =
        saved && saved.revision > (mine?.revision || 0) ? saved : mine;
    const [status, setStatus] = useState<SaveState>({ kind: "idle" });
    const mounted = useRef(true);
    const busy = useRef<string | null>(null);
    const change = useCallback(
        (next: Draft) => {
            current.current = next;
            retainDraft(storageKey, next);
            setDraft(next);
        },
        [storageKey],
    );
    useEffect(() => {
        mounted.current = true;
        const warn = (event: BeforeUnloadEvent) => {
            if (
                current.current.text !== current.current.base.text ||
                current.current.attempt
            ) {
                event.preventDefault();
                event.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", warn);
        return () => {
            mounted.current = false;
            window.removeEventListener("beforeunload", warn);
        };
    }, []);
    useEffect(() => {
        const value = current.current;
        if (
            busy.current ||
            value.attempt ||
            (latest?.revision || 0) <= value.base.revision
        )
            return;
        if (value.text === value.base.text) {
            change({ ...value, text: latest!.text, base: baseOf(latest) });
            setStatus({ kind: "idle" });
        } else setStatus({ kind: "conflict", current: latest || null });
    }, [latest, change]);
    const dirty = draft.text !== draft.base.text;
    const submit = async () => {
        if (
            busy.current ||
            status.kind === "conflict" ||
            (!dirty && !draft.attempt)
        )
            return;
        if (current.current.text.length > 4000) {
            setStatus({ kind: "error", message: copy.tooLong });
            return;
        }
        // An uncertain request is settled before newer typing gets a new request ID.
        const attempt = current.current.attempt || {
            text: current.current.text,
            expectedRevision: current.current.base.revision,
            mutationId: crypto.randomUUID(),
        };
        change({ ...current.current, attempt });
        busy.current = attempt.mutationId;
        setStatus({ kind: "saving" });
        try {
            const result = await saveMeetingAnswer({
                setId,
                questionId,
                ...attempt,
            });
            // A reopened editor owns the retained draft now; it can replay this ID.
            if (!mounted.current) return;
            if (result.kind === "conflict") {
                change({ ...current.current, attempt: null });
                setStatus({ kind: "conflict", current: result.current });
                return;
            }
            setSaved(result.answer);
            if (result.answer.revision > result.appliedRevision) {
                change({ ...current.current, attempt: null });
                setStatus({ kind: "conflict", current: result.answer });
                return;
            }
            change({
                ...current.current,
                text:
                    current.current.text === attempt.text
                        ? result.answer.text
                        : current.current.text,
                base: baseOf(result.answer),
                attempt: null,
            });
            setStatus({ kind: "saved" });
            busy.current = null;
            try {
                await onSaved();
            } catch {
                if (
                    mounted.current &&
                    !busy.current &&
                    current.current.base.revision === result.answer.revision
                )
                    setStatus({ kind: "saved", refreshFailed: true });
            }
        } catch (error) {
            if (mounted.current)
                setStatus({
                    kind: "error",
                    message:
                        error instanceof Error
                            ? error.message
                            : copy.saveFailed,
                });
        } finally {
            if (busy.current === attempt.mutationId) busy.current = null;
        }
    };

    return (
        <section className="kk-meeting-answer">
            <form onSubmit={form.handleSubmit(submit)}>
                <label
                    htmlFor={`${setId}-${questionId}-answer`}
                    className="font-medium"
                >
                    {copy.yourAnswer}
                </label>
                <textarea
                    id={`${setId}-${questionId}-answer`}
                    value={draft.text}
                    {...form.register("text", {
                        onChange: (event) =>
                            change({
                                ...current.current,
                                text: event.target.value,
                            }),
                    })}
                    rows={4}
                    maxLength={4000}
                    className="mt-2 w-full rounded-lg border bg-background p-3 text-base"
                />
                {form.formState.errors.text && (
                    <p role="alert">{form.formState.errors.text.message}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-2">
                    <Button
                        type="submit"
                        disabled={
                            (!dirty && !draft.attempt) ||
                            status.kind === "saving" ||
                            status.kind === "conflict"
                        }
                    >
                        {status.kind === "saving"
                            ? copy.saving
                            : draft.attempt
                              ? copy.retry
                              : copy.save}
                    </Button>
                    <span
                        className="text-sm text-muted-foreground"
                        role="status"
                    >
                        {dirty || draft.attempt
                            ? copy.unsaved
                            : status.kind === "saved"
                              ? copy.saved
                              : ""}
                    </span>
                </div>
                {draft.attempt && status.kind !== "saving" && (
                    <p className="mt-3 text-sm">{copy.retryPending}</p>
                )}
                {status.kind === "error" && (
                    <p role="alert" className="mt-3">
                        {status.message} {copy.draftKept}
                    </p>
                )}
                {status.kind === "saved" && status.refreshFailed && (
                    <p role="status" className="mt-3">
                        {copy.refreshFailed}
                    </p>
                )}
                {status.kind === "conflict" && (
                    <div role="alert" className="mt-3 rounded-lg border p-3">
                        <p>{copy.conflict}</p>
                        <p className="my-2 whitespace-pre-wrap break-words">
                            {status.current?.text || copy.emptyAnswer}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                change({
                                    ...current.current,
                                    base: baseOf(status.current),
                                    attempt: null,
                                });
                                setStatus({ kind: "idle" });
                            }}
                        >
                            {copy.keepDraft}
                        </Button>
                    </div>
                )}
            </form>
            {answers
                .filter(
                    (answer) =>
                        answer.author.kind !== "account" ||
                        answer.author.userId !== viewer.userId,
                )
                .map((answer) => (
                    <article key={answer.id} className="mt-4 border-t pt-3">
                        <h4 className="text-sm font-medium">
                            {answer.author.kind === "account"
                                ? answer.author.name
                                : copy.formerAdmin}
                        </h4>
                        <p className="mt-1 whitespace-pre-wrap break-words">
                            {answer.text || copy.emptyAnswer}
                        </p>
                    </article>
                ))}
            {!!latest?.history.length && (
                <details className="mt-4 text-sm">
                    <summary>{copy.history}</summary>
                    <ol className="mt-3 grid gap-3">
                        {[...latest.history].reverse().map((entry) => (
                            <li
                                key={entry.revision}
                                className="rounded-lg border p-3"
                            >
                                <time dateTime={entry.at}>
                                    {new Date(entry.at).toLocaleString()}
                                </time>
                                <p className="my-2 whitespace-pre-wrap break-words">
                                    {entry.text || copy.emptyAnswer}
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    disabled={
                                        entry.text === draft.text ||
                                        status.kind === "saving"
                                    }
                                    onClick={() =>
                                        change({
                                            ...current.current,
                                            text: entry.text,
                                        })
                                    }
                                >
                                    {copy.useAnswer}
                                </Button>
                            </li>
                        ))}
                    </ol>
                </details>
            )}
        </section>
    );
}
