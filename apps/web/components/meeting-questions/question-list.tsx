"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type {
    MeetingQuestionSet,
    MeetingQuestionsSnapshot,
} from "@courselit/common-models";
import { meetingQuestionsUi as copy } from "@config/strings";
import MeetingAnswer from "./answer";

interface QuestionListProps {
    set: MeetingQuestionSet;
    data: MeetingQuestionsSnapshot;
    questionIds?: string[];
    openQuestion?: string;
    onSaved: () => Promise<void>;
}

export default function QuestionList({
    set,
    data,
    questionIds,
    openQuestion,
    onSaved,
}: QuestionListProps) {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!openQuestion) return;
        const details = root.current?.querySelector<HTMLDetailsElement>(
            `[data-question="${CSS.escape(openQuestion)}"]`,
        );
        if (details) {
            details.open = true;
            details.scrollIntoView({ block: "nearest" });
            details.querySelector("summary")?.focus();
        }
    }, [openQuestion]);
    return (
        <div ref={root} className="kk-meeting-list grid gap-3">
            {set.questions
                .filter(
                    (question) =>
                        !questionIds || questionIds.includes(question.id),
                )
                .map((question) => (
                    <details
                        key={question.id}
                        id={`${set.id}:${question.id}`}
                        data-question={question.id}
                        className="rounded-xl border bg-background"
                    >
                        <summary className="cursor-pointer p-4 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                            {question.number}. {question.title}
                        </summary>
                        <div className="px-4 pb-5">
                            {question.group === "humanitix" && (
                                <p className="mb-3 text-sm text-muted-foreground">
                                    {copy.onIce}
                                </p>
                            )}
                            <p className="whitespace-pre-wrap leading-relaxed">
                                {question.context}
                            </p>
                            {question.candidateGroups.map((group) => (
                                <details
                                    key={group.title}
                                    className="my-4 rounded-lg bg-muted/40 p-3"
                                >
                                    <summary className="cursor-pointer font-medium">
                                        {group.title}
                                    </summary>
                                    <p className="mt-3 text-sm text-muted-foreground">
                                        {copy.candidates}
                                    </p>
                                    <ol className="mt-3 list-decimal pl-5 space-y-3">
                                        {group.options.map((option) => (
                                            <li key={option.label}>
                                                <strong>{option.label}</strong>
                                                <p>{option.text}</p>
                                            </li>
                                        ))}
                                    </ol>
                                </details>
                            ))}
                            {!!question.locations.length && (
                                <nav
                                    aria-label={copy.context}
                                    className="my-4 flex flex-wrap gap-3 text-sm"
                                >
                                    {question.locations.map((location) => (
                                        <Link
                                            key={`${location.path}:${location.componentId}`}
                                            className="underline underline-offset-4"
                                            href={`${location.path}?meeting-set=${encodeURIComponent(set.id)}&meeting-question=${encodeURIComponent(question.id)}&meeting-component=${encodeURIComponent(location.componentId)}`}
                                        >
                                            {location.label}
                                        </Link>
                                    ))}
                                </nav>
                            )}
                            <div className="mt-5 border-t pt-4">
                                <MeetingAnswer
                                    setId={set.id}
                                    questionId={question.id}
                                    answers={data.answers.filter(
                                        (answer) =>
                                            answer.setId === set.id &&
                                            answer.questionId === question.id,
                                    )}
                                    viewer={data.viewer}
                                    onSaved={onSaved}
                                />
                            </div>
                        </div>
                    </details>
                ))}
        </div>
    );
}
