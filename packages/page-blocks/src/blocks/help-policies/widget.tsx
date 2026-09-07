import { useEffect, useState } from "react";
import type { WidgetProps } from "@courselit/common-models";
import content from "./content";
import type Settings from "./settings";
import TopicCard from "./topic-card";
import { helpStyles } from "./styles";

export default function Widget({ settings, state }: WidgetProps<Settings>) {
    const variant = settings.variant || "terms";
    const defaults = content[variant];
    const topics = settings.topics ?? defaults.topics;
    const [query, setQuery] = useState("");
    const [mode, setMode] = useState<"summary" | "full">("summary");
    const [reveals, setReveals] = useState<Record<string, boolean>>({});
    useEffect(() => {
        const restore = () => setReveals({});
        window.addEventListener("scroll", restore, true);
        return () => window.removeEventListener("scroll", restore, true);
    }, []);
    const search = query.trim().toLocaleLowerCase();
    const shown = topics.filter((topic) =>
        `${topic.title} ${topic.summary} ${topic.full}`
            .toLocaleLowerCase()
            .includes(search),
    );
    const refundHref = state.profile?.userId
        ? "/dashboard/membership"
        : "/login?redirect=%2Fdashboard%2Fmembership";
    const Heading = variant === "help" ? "h2" : "h1";
    return (
        <section className="kk-help" id={settings.cssId}>
            <style>{helpStyles}</style>
            {variant !== "help" && (
                <nav className="kk-help-nav" aria-label="Help and policies">
                    <a href="/p/contact">Help & contact</a>
                    <a
                        href="/p/terms"
                        aria-current={variant === "terms" ? "page" : undefined}
                    >
                        Terms & cancellation
                    </a>
                    <a
                        href="/p/privacy"
                        aria-current={
                            variant === "privacy" ? "page" : undefined
                        }
                    >
                        Privacy
                    </a>
                </nav>
            )}
            <Heading>{settings.title ?? defaults.title}</Heading>
            <p>{settings.intro ?? defaults.intro}</p>
            <div className="kk-help-controls">
                <label className="kk-help-search">
                    Find a topic
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search these topics"
                    />
                </label>
                <div
                    className="kk-help-mode"
                    role="group"
                    aria-label="Read policies as"
                >
                    {(["summary", "full"] as const).map((value) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={mode === value}
                            onClick={() => {
                                setMode(value);
                                setReveals({});
                            }}
                        >
                            {value === "summary" ? "Summary" : "Full text"}
                        </button>
                    ))}
                </div>
            </div>
            <p className="kk-help-hint">
                Select text freely. Tap a card or use its button to turn it
                over; scrolling returns it to your chosen view.
            </p>
            <p className="kk-help-hint" role="status">
                {shown.length} {shown.length === 1 ? "topic" : "topics"}
                {search ? " found" : ""}
            </p>
            {!shown.length && (
                <p>
                    No matching topics. Try another word or{" "}
                    <button type="button" onClick={() => setQuery("")}>
                        Clear search
                    </button>
                    .
                </p>
            )}
            <div className="kk-policy-grid">
                {topics.map((topic) => (
                    <TopicCard
                        key={topic.id}
                        topic={topic}
                        hidden={!shown.includes(topic)}
                        full={reveals[topic.id] ?? mode === "full"}
                        onReveal={() =>
                            setReveals((current) => ({
                                ...current,
                                [topic.id]: !(
                                    current[topic.id] ?? mode === "full"
                                ),
                            }))
                        }
                    />
                ))}
            </div>
            <div className="kk-help-actions">
                <a className="kk-help-action" href={refundHref}>
                    Request a refund
                </a>
                <a href="mailto:clozach+kk@gmail.com">Ask support</a>
            </div>
            {!state.profile?.userId && (
                <p className="kk-help-hint">
                    Sign in with your purchase email to see your membership and
                    refund options.
                </p>
            )}
            <div className="kk-help-note">
                <p>
                    Questions are welcome. Contact{" "}
                    <a href="mailto:clozach+kk@gmail.com">
                        clozach+kk@gmail.com
                    </a>
                    , or use the round ? control to send a private comment about
                    this page.
                </p>
                <p>Last updated: {settings.updated ?? content.updated}.</p>
            </div>
        </section>
    );
}
