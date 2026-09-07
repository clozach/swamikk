"use client";
import { useEffect, useState } from "react";
import type {
    ClassChoice,
    ClassChoices,
} from "@/services/class-checkout/types";
import type { ClassCheckoutStatus } from "@/services/class-checkout/status";

type Loaded = { key: string; offer: ClassChoices; status: ClassCheckoutStatus };
export function useClassChoices(
    backend: string,
    courseId: string | null,
    planId: string | undefined,
    userId?: string,
    planType?: string,
) {
    const checkDates = planType === "onetime";
    const key = `${courseId || ""}:${planId || ""}:${userId || ""}:${checkDates}`;
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [failedKey, setFailedKey] = useState<string | null>(null);
    const [choice, setChoice] = useState<ClassChoice>();
    const [retry, setRetry] = useState(0);
    const storageKey = `class-choice:${backend}:${courseId}:${planId}`;
    useEffect(() => {
        if (!courseId || !planId) return;
        let active = true;
        const read = async (url: string) => {
            const response = await fetch(url, { cache: "no-store" });
            if (!response.ok) throw new Error("Offer unavailable");
            return response.json();
        };
        Promise.all([
            checkDates
                ? read(
                      `${backend}/api/class-checkout?courseId=${encodeURIComponent(courseId)}&planId=${encodeURIComponent(planId)}`,
                  )
                : Promise.resolve({ kind: "ordinary" }),
            userId
                ? read(
                      `${backend}/api/class-checkout/status?courseId=${encodeURIComponent(courseId)}`,
                  )
                : Promise.resolve({ kind: "none" }),
        ])
            .then(([offer, status]) => {
                if (!active) return;
                let saved: ClassChoice | undefined;
                try {
                    saved =
                        JSON.parse(
                            sessionStorage.getItem(storageKey) || "null",
                        ) || undefined;
                } catch {}
                const preferred =
                    status.kind === "ready" ? status.choice : saved;
                setChoice(
                    offer.kind === "class" &&
                        offer.choices.some(
                            (item: ClassChoice) =>
                                item.cohortId === preferred?.cohortId &&
                                item.fingerprint === preferred?.fingerprint,
                        )
                        ? preferred
                        : undefined,
                );
                setLoaded({
                    key,
                    offer,
                    status:
                        status.kind === "ready" && status.planId !== planId
                            ? { kind: "pending", reference: status.reference }
                            : status,
                });
                setFailedKey(null);
            })
            .catch(() => {
                if (active) setFailedKey(key);
            });
        return () => {
            active = false;
        };
    }, [backend, courseId, planId, userId, key, retry, storageKey, checkDates]);
    const current = loaded?.key === key ? loaded : null;
    const choose = (value?: ClassChoice) => {
        setChoice(value);
        try {
            if (value) {
                sessionStorage.setItem(storageKey, JSON.stringify(value));
                sessionStorage.setItem(
                    `class-plan:${backend}:${courseId}`,
                    planId || "",
                );
            } else sessionStorage.removeItem(storageKey);
        } catch {}
    };
    return {
        offer:
            !courseId || !planId
                ? { kind: "ordinary" as const }
                : failedKey === key
                  ? { kind: "unavailable" as const }
                  : current?.offer || { kind: "loading" as const },
        status: current?.status || { kind: "none" as const },
        choice: current ? choice : undefined,
        choose,
        refresh: () => {
            setFailedKey(null);
            setLoaded(null);
            setRetry((value) => value + 1);
        },
    };
}
