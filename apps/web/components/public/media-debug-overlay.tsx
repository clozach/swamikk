"use client";

import { useEffect, useRef, useState } from "react";

// Diagnostic overlay for hunting media / bfcache / payment-script bugs in any
// browser (built for Safari, where the harness has no eyes). Off by default.
//
//   enable:  visit any page with ?mediadebug=1   (persists for the tab)
//   disable: visit any page with ?mediadebug=0   (or close the tab)
//
// Shows a live panel (bottom-right): current path, every <video>/<audio> with
// its play state, external payment-script frame count, and a timestamped event
// log of play/pause/ended plus pageshow/pagehide with the bfcache (persisted)
// flag — a `play` right after `pageshow {bfcache:true}` is a bfcache resume.
// Everything is also mirrored to the console prefixed [MEDIA-DEBUG].
//
// The panel doubles as a staleness canary: it only exists in builds that
// contain it, so "?mediadebug=1 shows nothing" means the tab is running old
// JavaScript and needs a reload.

const OVERLAY_VERSION = "mediadebug v1 (2026-07-17)";
const STORAGE_KEY = "mediaDebug";
const MAX_LOG = 40;

interface MediaSnapshot {
    tag: string;
    src: string;
    paused: boolean;
    muted: boolean;
    time: string;
}

interface Snapshot {
    path: string;
    media: MediaSnapshot[];
    paymentFrames: number;
}

const srcTail = (m: HTMLMediaElement) =>
    (m.currentSrc || m.src || "(no src)").split("/").slice(-1)[0].slice(0, 32);

export default function MediaDebugOverlay() {
    const [enabled, setEnabled] = useState(false);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [log, setLog] = useState<string[]>([]);
    const logRef = useRef<string[]>([]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const flag = params.get("mediadebug");
        if (flag === "1") sessionStorage.setItem(STORAGE_KEY, "1");
        if (flag === "0") sessionStorage.removeItem(STORAGE_KEY);
        setEnabled(sessionStorage.getItem(STORAGE_KEY) === "1");
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const addLog = (msg: string) => {
            const stamp = new Date().toISOString().slice(11, 23);
            const entry = `${stamp} ${msg}`;
            // eslint-disable-next-line no-console
            console.log(`[MEDIA-DEBUG] ${entry}`);
            logRef.current = [...logRef.current.slice(-(MAX_LOG - 1)), entry];
            setLog(logRef.current);
        };

        addLog(`armed — ${OVERLAY_VERSION}`);

        const onMediaEvent = (e: Event) => {
            const t = e.target as HTMLMediaElement;
            if (!t || !/^(VIDEO|AUDIO)$/.test(t.tagName)) return;
            addLog(
                `${t.tagName.toLowerCase()} ${e.type} ${srcTail(t)} t=${t.currentTime.toFixed(1)} muted=${t.muted} @${window.location.pathname}`,
            );
        };
        const onPageShow = (e: PageTransitionEvent) =>
            addLog(
                `pageshow bfcache=${e.persisted} @${window.location.pathname}`,
            );
        const onPageHide = (e: PageTransitionEvent) =>
            addLog(
                `pagehide bfcache=${e.persisted} @${window.location.pathname}`,
            );

        const mediaEvents = ["play", "pause", "ended"] as const;
        mediaEvents.forEach((ev) =>
            document.addEventListener(ev, onMediaEvent, true),
        );
        window.addEventListener("pageshow", onPageShow);
        window.addEventListener("pagehide", onPageHide);

        const tick = () => {
            const media = Array.from(
                document.querySelectorAll<HTMLMediaElement>("video,audio"),
            ).map((m) => ({
                tag: m.tagName.toLowerCase(),
                src: srcTail(m),
                paused: m.paused,
                muted: m.muted,
                time: m.currentTime.toFixed(1),
            }));
            const paymentFrames = Array.from(
                document.querySelectorAll("iframe"),
            ).filter((f) =>
                /stripe|razorpay|lemonsqueezy/i.test(f.src || ""),
            ).length;
            setSnapshot({
                path:
                    window.location.pathname +
                    window.location.search.slice(0, 40),
                media,
                paymentFrames,
            });
        };
        tick();
        const interval = window.setInterval(tick, 500);

        return () => {
            mediaEvents.forEach((ev) =>
                document.removeEventListener(ev, onMediaEvent, true),
            );
            window.removeEventListener("pageshow", onPageShow);
            window.removeEventListener("pagehide", onPageHide);
            window.clearInterval(interval);
        };
    }, [enabled]);

    if (!enabled || !snapshot) return null;

    return (
        <div
            style={{
                position: "fixed",
                bottom: 8,
                right: 8,
                zIndex: 2147483647,
                maxWidth: 380,
                maxHeight: 280,
                overflow: "auto",
                background: "rgba(10,10,10,0.88)",
                color: "#eee",
                font: "11px/1.5 ui-monospace, Menlo, monospace",
                padding: "8px 10px",
                borderRadius: 8,
                pointerEvents: "auto",
            }}
        >
            <div style={{ fontWeight: 700 }}>
                🔍 {OVERLAY_VERSION} — {snapshot.path}
            </div>
            <div>
                media: {snapshot.media.length} · playing:{" "}
                {snapshot.media.filter((m) => !m.paused).length} · payment
                iframes: {snapshot.paymentFrames}
            </div>
            {snapshot.media.map((m, i) => (
                <div key={i}>
                    {m.paused ? "⏸" : "▶️"}
                    {m.muted ? "🔇" : "🔊"} {m.tag} {m.src} t={m.time}
                </div>
            ))}
            <div
                style={{
                    marginTop: 4,
                    borderTop: "1px solid #444",
                    paddingTop: 4,
                }}
            >
                {log.slice(-12).map((l, i) => (
                    <div key={i}>{l}</div>
                ))}
            </div>
        </div>
    );
}
