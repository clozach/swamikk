import { FormEvent, useEffect, useState } from "react";
import { MediaSelector } from "@courselit/components-library";
import type {
    Address,
    ContextualFeedback,
    Media,
    Profile,
} from "@courselit/common-models";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { feedbackUi as copy } from "@config/strings";
import { PageSelection } from "./targets";
import { feedbackRequest } from "./api";

export default function CommentForm({
    selection,
    profile,
    address,
    admin,
    onSent,
}: {
    selection: PageSelection;
    profile: Partial<Profile> | null;
    address: Address;
    admin: boolean;
    onSent: () => void;
}) {
    const storageKey = `kk-comment:${profile?.userId || "visitor"}:${JSON.stringify(selection.target)}`;
    const [text, setText] = useState(() => {
        try {
            return typeof window === "undefined"
                ? ""
                : sessionStorage.getItem(storageKey) || "";
        } catch {
            return "";
        }
    });
    const [photo, setPhoto] = useState<Media | null>(null);
    const [status, setStatus] = useState<
        | { kind: "ready" }
        | { kind: "sending" }
        | { kind: "error"; message: string }
    >({ kind: "ready" });
    useEffect(() => {
        try {
            if (text) sessionStorage.setItem(storageKey, text);
            else sessionStorage.removeItem(storageKey);
        } catch {
            /* The mounted draft still survives failed requests. */
        }
    }, [storageKey, text]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!text.trim() || status.kind === "sending") return;
        setStatus({ kind: "sending" });
        try {
            await feedbackRequest<{ feedback: ContextualFeedback }>(
                "/api/feedback",
                {
                    text: text.trim(),
                    target: selection.target,
                    ...(admin && photo
                        ? { photoMediaIds: [photo.mediaId] }
                        : {}),
                },
            );
            try {
                sessionStorage.removeItem(storageKey);
            } catch {
                /* No stored draft to clear. */
            }
            setText("");
            onSent();
        } catch (error) {
            setStatus({
                kind: "error",
                message: error instanceof Error ? error.message : copy.failed,
            });
        }
    };

    return (
        <>
            <DialogTitle>{copy.comment}</DialogTitle>
            <DialogDescription>{selection.label}</DialogDescription>
            <form onSubmit={submit} className="grid gap-4">
                <label className="grid gap-2 text-sm font-medium">
                    {copy.commentLabel}
                    <textarea
                        autoFocus
                        required
                        maxLength={4000}
                        rows={6}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        className="w-full rounded-lg border bg-background p-3 text-base font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    />
                </label>
                <p className="text-sm text-muted-foreground">{copy.privacy}</p>
                {admin && profile?.userId && (
                    <MediaSelector
                        title={copy.photo}
                        src={photo?.thumbnail || ""}
                        srcTitle={photo?.originalFileName || ""}
                        profile={profile as Profile}
                        address={address}
                        mediaId={photo?.mediaId}
                        onSelection={(media: Media) => setPhoto(media)}
                        onRemove={() => setPhoto(null)}
                        strings={{}}
                        access="private"
                        type="page"
                    />
                )}
                {status.kind === "error" && (
                    <p role="alert" className="text-sm text-destructive">
                        {status.message} {copy.draftKept}
                    </p>
                )}
                <div className="flex flex-wrap justify-between gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        disabled={!text || status.kind === "sending"}
                        onClick={() => setText("")}
                    >
                        {copy.clear}
                    </Button>
                    <Button
                        type="submit"
                        className="min-h-11"
                        disabled={!text.trim() || status.kind === "sending"}
                    >
                        {status.kind === "sending" ? copy.sending : copy.send}
                    </Button>
                </div>
            </form>
        </>
    );
}
