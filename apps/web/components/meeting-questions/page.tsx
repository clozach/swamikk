"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { meetingQuestionsUi as copy } from "@config/strings";
import { useQuestions } from "./use-questions";
import QuestionList from "./question-list";

export default function MeetingQuestionsPage() {
    const { state, permitted, refresh } = useQuestions();
    const [questionHash, setQuestionHash] = useState("");
    useEffect(() => {
        const readHash = () => setQuestionHash(window.location.hash.slice(1));
        readHash();
        window.addEventListener("hashchange", readHash);
        return () => window.removeEventListener("hashchange", readHash);
    }, []);
    const [setId, questionId] = questionHash.includes(":")
        ? questionHash.split(":", 2)
        : ["", questionHash];
    const matchingSets =
        state.kind === "ready"
            ? state.data.sets.filter((set) =>
                  set.questions.some((question) => question.id === questionId),
              )
            : [];
    const requestedSetId =
        setId || (matchingSets.length === 1 ? matchingSets[0].id : "");
    return (
        <main
            data-feedback-ui
            className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6"
        >
            <Link href="/" className="text-sm underline underline-offset-4">
                {copy.home}
            </Link>
            <header className="my-6">
                <h1 className="text-3xl font-semibold">{copy.title}</h1>
                <p className="mt-3 max-w-2xl text-muted-foreground">
                    {copy.intro}
                </p>
            </header>
            {!permitted || state.kind === "restricted" ? (
                <div className="rounded-xl border p-6">
                    <p>{copy.restricted}</p>
                    <Button asChild className="mt-4">
                        <Link href="/login">{copy.signIn}</Link>
                    </Button>
                </div>
            ) : state.kind === "loading" ? (
                <p role="status">{copy.loading}</p>
            ) : state.kind === "error" ? (
                <div role="alert">
                    <p>{state.message}</p>
                    <Button className="mt-3" onClick={refresh}>
                        {copy.refresh}
                    </Button>
                </div>
            ) : state.kind === "ready" ? (
                <>
                    {state.refreshError && (
                        <p role="status" className="mb-3 text-sm">
                            {state.refreshError}
                        </p>
                    )}
                    <div className="mb-5 flex justify-end">
                        <Button variant="outline" onClick={refresh}>
                            {copy.refresh}
                        </Button>
                    </div>
                    {!state.data.sets.length && <p>{copy.empty}</p>}
                    {state.data.sets.map((set) => (
                        <section key={set.id} className="mb-8">
                            <p className="mb-5 whitespace-pre-wrap">
                                {set.intro}
                            </p>
                            <QuestionList
                                set={set}
                                data={state.data}
                                openQuestion={
                                    set.id === requestedSetId
                                        ? questionId
                                        : undefined
                                }
                                onSaved={refresh}
                            />
                        </section>
                    ))}
                </>
            ) : null}
        </main>
    );
}
