import { useRef, type MouseEvent } from "react";
import type { PolicyTopic } from "./settings";

export default function TopicCard({
    topic,
    full,
    hidden,
    onReveal,
}: {
    topic: PolicyTopic;
    full: boolean;
    hidden: boolean;
    onReveal: () => void;
}) {
    const pointer = useRef<{
        at: number;
        x: number;
        y: number;
        moved: boolean;
    }>();
    function revealFromCard(event: MouseEvent<HTMLElement>) {
        if ((event.target as Element).closest("a,button,input,textarea,select"))
            return;
        if (window.getSelection()?.toString()) return;
        if (
            pointer.current &&
            (pointer.current.moved || Date.now() - pointer.current.at > 350)
        )
            return;
        onReveal();
    }
    return (
        <article
            className="kk-policy-card"
            aria-label={topic.title}
            hidden={hidden}
            onClick={revealFromCard}
            onPointerDown={(event) => {
                pointer.current = {
                    at: Date.now(),
                    x: event.clientX,
                    y: event.clientY,
                    moved: false,
                };
            }}
            onPointerMove={(event) => {
                if (
                    pointer.current &&
                    (Math.abs(event.clientX - pointer.current.x) > 6 ||
                        Math.abs(event.clientY - pointer.current.y) > 6)
                )
                    pointer.current.moved = true;
            }}
        >
            <h3>{topic.title}</h3>
            <p className="kk-policy-summary" hidden={full}>
                {topic.summary}
            </p>
            <p className="kk-policy-full" hidden={!full}>
                {topic.full}
            </p>
            <button
                type="button"
                onClick={onReveal}
                aria-expanded={full}
                aria-label={`${full ? "Back to summary" : "Read full text"}: ${topic.title}`}
            >
                {full ? "Back to summary" : "Read full text"}
            </button>
        </article>
    );
}
