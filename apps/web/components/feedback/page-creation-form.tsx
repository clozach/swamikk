"use client";
import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ProfileContext } from "@/components/contexts";
import { useMemberMimic } from "@/components/member-mimic/context";
import { Button } from "@/components/ui/button";
import { feedbackRequest } from "./api";
import type { ContentChange } from "@courselit/common-models";

const empty = { title: "", pageId: "", intent: "", materials: "", body: "" };
export const pageBody = (body: string) => ({
    type: "doc" as const,
    content: body
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((text) => ({
            type: "paragraph",
            content: [{ type: "text", text }],
        })),
});
export default function PageCreationForm() {
    const { profile } = useContext(ProfileContext);
    const mimic = useMemberMimic();
    if (
        mimic.kind !== "inactive" ||
        !profile?.userId ||
        !profile?.permissions?.includes("site:manage")
    )
        return null;
    return <Draft key={profile.userId} userId={profile.userId} />;
}
function Draft({ userId }: { userId: string }) {
    const router = useRouter();
    const key = `page-edit:${userId}:new-page`;
    const [draft, setDraft] = useState(() => {
        try {
            const value = JSON.parse(sessionStorage.getItem(key) || "null");
            if (
                value &&
                Object.keys(empty).every(
                    (field) => typeof value[field] === "string",
                )
            )
                return value as typeof empty;
        } catch {
            /* Keep mounted text when storage is unavailable. */
        }
        return empty;
    });
    const [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const inFlight = useRef(false),
        mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        try {
            sessionStorage.setItem(key, JSON.stringify(draft));
        } catch {
            /* The form remains usable. */
        }
    }, [key, draft]);
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setError("");
        try {
            const result = await feedbackRequest<{ change: ContentChange }>(
                "/api/content-changes",
                {
                    target: { kind: "page-create", pageId: draft.pageId },
                    patch: {
                        kind: "page-create",
                        title: draft.title,
                        intent: draft.intent,
                        materials: draft.materials,
                        content: pageBody(draft.body),
                    },
                    summary: `Create draft page: ${draft.title}`,
                },
            );
            if (!mounted.current) return;
            try {
                sessionStorage.removeItem(key);
            } catch {
                /* Review can still open. */
            }
            router.push(
                `/dashboard/changes/${encodeURIComponent(result.change.id)}`,
            );
        } catch (failure) {
            if (mounted.current)
                setError(
                    `${failure instanceof Error ? failure.message : "The proposal response was interrupted."} Your text is kept. Check the proposals list before retrying an interrupted request.`,
                );
        } finally {
            inFlight.current = false;
            if (mounted.current) setBusy(false);
        }
    }
    const field = (name: keyof typeof empty) => ({
        value: draft[name],
        disabled: busy,
        onChange: (event: { target: { value: string } }) =>
            setDraft((current) => ({ ...current, [name]: event.target.value })),
    });
    return (
        <details className="mb-8 rounded-xl border p-5" data-feedback-ui>
            <summary className="min-h-11 cursor-pointer text-lg font-semibold">
                Propose a new text page
            </summary>
            <p className="my-4 max-w-2xl text-muted-foreground">
                Keep your prompt and source material with the proposed final
                text. This form prepares a review; a separate approval creates
                an unpublished native page. It does not generate text or publish
                the site.
            </p>
            <form onSubmit={submit} className="grid max-w-3xl gap-5">
                <label className="grid gap-2">
                    Prompt / intended result
                    <textarea
                        required
                        maxLength={4000}
                        rows={3}
                        className="rounded border p-3"
                        {...field("intent")}
                    />
                </label>
                <label className="grid gap-2">
                    Source material (optional)
                    <textarea
                        maxLength={20000}
                        rows={4}
                        className="rounded border p-3"
                        {...field("materials")}
                    />
                    <span className="text-sm text-muted-foreground">
                        Retained in the admin proposal history. Include only
                        material you intend to keep there.
                    </span>
                </label>
                <label className="grid gap-2">
                    Page title
                    <input
                        required
                        maxLength={240}
                        className="rounded border p-3"
                        {...field("title")}
                    />
                </label>
                <label className="grid gap-2">
                    Page address: /p/
                    <input
                        required
                        maxLength={128}
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        placeholder="your-page-name"
                        className="rounded border p-3"
                        {...field("pageId")}
                    />
                    <span className="text-sm text-muted-foreground">
                        Use lowercase letters, numbers and hyphens. An existing
                        address cannot be replaced.
                    </span>
                </label>
                <label className="grid gap-2">
                    Proposed final body
                    <textarea
                        required
                        maxLength={20000}
                        rows={10}
                        className="rounded border p-3"
                        {...field("body")}
                    />
                    <span className="text-sm text-muted-foreground">
                        Plain text; blank lines separate paragraphs. The page
                        title appears first.
                    </span>
                </label>
                {error && <p role="alert">{error}</p>}
                <Button className="min-h-11 w-fit" disabled={busy}>
                    {busy ? "Preparing review…" : "Prepare page review"}
                </Button>
            </form>
        </details>
    );
}
