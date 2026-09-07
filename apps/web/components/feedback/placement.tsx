"use client";

import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { useMemberMimic } from "@/components/member-mimic/context";

type Placement = {
    host: HTMLElement | null;
    register: (host: HTMLElement) => () => void;
};

const PlacementContext = createContext<Placement | null>(null);

/** Live shells explicitly offer a slot; native previews never register one. */
export function FeedbackPlacementProvider({
    children,
}: {
    children: ReactNode;
}) {
    const [hosts, setHosts] = useState<HTMLElement[]>([]);
    const register = useCallback((host: HTMLElement) => {
        setHosts((current) => [
            ...current.filter((item) => item !== host),
            host,
        ]);
        return () =>
            setHosts((current) => current.filter((item) => item !== host));
    }, []);
    const value = useMemo(
        () => ({ host: hosts[0] ?? null, register }),
        [hosts, register],
    );
    return (
        <PlacementContext.Provider value={value}>
            {children}
        </PlacementContext.Provider>
    );
}

export function FeedbackControlSlot() {
    const placement = useContext(PlacementContext);
    const mimic = useMemberMimic();
    const cleanup = useRef<(() => void) | undefined>(undefined);
    const register = placement?.register;
    const ref = useCallback(
        (node: HTMLSpanElement | null) => {
            cleanup.current?.();
            cleanup.current = node && register ? register(node) : undefined;
        },
        [register],
    );
    if (!register || mimic.kind !== "inactive") return null;
    return <span ref={ref} data-feedback-ui className="kk-feedback-slot" />;
}

export function FeedbackControlPlacement({
    children,
}: {
    children: ReactNode;
}) {
    const placement = useContext(PlacementContext);
    return placement?.host ? (
        createPortal(children, placement.host)
    ) : (
        <div data-feedback-ui className="kk-feedback-fallback">
            {children}
        </div>
    );
}
