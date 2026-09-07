"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { memberMimicUi as copy } from "@/config/strings";
import { announceMemberMimicChange } from "./context";

export default function StartMemberMimic({ userId }: { userId: string }) {
    const started = useRef(false);
    const [error, setError] = useState("");

    async function start() {
        setError("");
        try {
            const referrer = document.referrer
                ? new URL(document.referrer)
                : null;
            const returnTo =
                referrer?.origin === window.location.origin &&
                referrer.pathname === "/dashboard/users"
                    ? referrer.pathname + referrer.search
                    : "/dashboard/users";
            const response = await fetch("/api/member-mimic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ userId, returnTo }),
            });
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.error?.message || copy.openFailed);
            announceMemberMimicChange();
            window.location.replace(result.redirectTo || "/dashboard/profile");
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : copy.openFailed,
            );
        }
    }

    useEffect(() => {
        if (!started.current) {
            started.current = true;
            void start();
        }
    }, [userId]);
    return (
        <main className="mx-auto max-w-xl p-8" aria-live="polite">
            <h1 className="text-2xl font-semibold">{copy.title}</h1>
            {error ? (
                <>
                    <p className="my-4" role="alert">
                        {error}
                    </p>
                    <button
                        className="rounded-md border px-4 py-3"
                        onClick={start}
                    >
                        {copy.retry}
                    </button>
                </>
            ) : (
                <p className="my-4">{copy.opening}</p>
            )}
            <Link className="mt-6 block underline" href="/dashboard/users">
                {copy.returnToMembers}
            </Link>
        </main>
    );
}
