"use client";

import {
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import type { MeetingQuestionsSnapshot } from "@courselit/common-models";
import { ProfileContext } from "@components/contexts";
import { checkPermission } from "@courselit/utils";
import { FEEDBACK_ADMIN_PERMISSIONS } from "@ui-config/constants";
import { useMemberMimic } from "@/components/member-mimic/context";
import { meetingQuestionsUi as copy } from "@config/strings";
import { loadMeetingQuestions } from "./api";

export type QuestionsState =
    | { kind: "loading" }
    | { kind: "restricted" }
    | { kind: "error"; message: string }
    | { kind: "ready"; data: MeetingQuestionsSnapshot; refreshError?: string };

type ReadEntry = {
    readers: number;
    pending?: Promise<MeetingQuestionsSnapshot>;
};
// Share only in-flight reads, never a previous account's cached snapshot.
const reads = new Map<string, ReadEntry>();
function read(userId: string) {
    const entry = reads.get(userId) || { readers: 0 };
    reads.set(userId, entry);
    if (!entry.pending) {
        const pending = loadMeetingQuestions();
        entry.pending = pending;
        const clear = () => {
            if (entry.pending === pending) entry.pending = undefined;
        };
        void pending.then(clear, clear);
    }
    return entry.pending;
}

export function useQuestions() {
    const { profile } = useContext(ProfileContext);
    const mimic = useMemberMimic();
    const permitted =
        mimic.kind === "inactive" &&
        !!profile?.userId &&
        !!profile.permissions &&
        checkPermission(profile.permissions, FEEDBACK_ADMIN_PERMISSIONS);
    const userId = permitted ? profile!.userId! : null;
    const identity = useRef(userId);
    useLayoutEffect(() => {
        identity.current = userId;
    }, [userId]);
    const sequence = useRef(0);
    const [loaded, setLoaded] = useState<{
        userId: string;
        state: QuestionsState;
    } | null>(null);
    if (loaded && loaded.userId !== userId) setLoaded(null);
    const refresh = useCallback((): Promise<void> => {
        if (!userId || identity.current !== userId) return Promise.resolve();
        const request = ++sequence.current;
        return read(userId)
            .then((data) => {
                if (identity.current !== userId || sequence.current !== request)
                    return;
                setLoaded({
                    userId,
                    state:
                        data.viewer.userId === userId
                            ? { kind: "ready", data }
                            : { kind: "restricted" },
                });
            })
            .catch((error) => {
                if (identity.current !== userId || sequence.current !== request)
                    return;
                const status = (error as { status?: number } | null)?.status;
                const message =
                    error instanceof Error ? error.message : copy.loadFailed;
                setLoaded((previous) => ({
                    userId,
                    state:
                        status === 401 || status === 403
                            ? { kind: "restricted" }
                            : previous?.userId === userId &&
                                previous.state.kind === "ready"
                              ? { ...previous.state, refreshError: message }
                              : { kind: "error", message },
                }));
            });
    }, [userId]);
    useEffect(() => {
        if (!userId) return;
        const entry = reads.get(userId) || { readers: 0 };
        reads.set(userId, entry);
        entry.readers++;
        void refresh();
        const refreshVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };
        const timer = window.setInterval(refreshVisible, 15_000);
        window.addEventListener("focus", refreshVisible);
        document.addEventListener("visibilitychange", refreshVisible);
        return () => {
            sequence.current++;
            window.clearInterval(timer);
            window.removeEventListener("focus", refreshVisible);
            document.removeEventListener("visibilitychange", refreshVisible);
            if (--entry.readers === 0 && reads.get(userId) === entry)
                reads.delete(userId);
        };
    }, [userId, refresh]);
    const state: QuestionsState = !userId
        ? { kind: "restricted" }
        : loaded?.userId === userId
          ? loaded.state
          : { kind: "loading" };
    return { state, refresh, permitted };
}
