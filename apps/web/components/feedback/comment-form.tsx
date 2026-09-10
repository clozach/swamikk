import { useEffect, useState, type ClipboardEvent } from "react";
import { X } from "lucide-react";
import { MediaSelector, useMediaLit } from "@courselit/components-library";
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
    onClose,
}: {
    selection: PageSelection;
    profile: Partial<Profile> | null;
    address: Address;
    admin: boolean;
    onSent: () => void;
    onClose?: () => void;
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
    const canAttach = admin && !!profile?.userId;
    const [paste, setPaste] = useState<
        | { kind: "idle" }
        | { kind: "uploading" }
        | { kind: "error"; message: string }
    >({ kind: "idle" });
    // Same private library upload the picker dialog uses; a pasted image
    // becomes the attached photo without opening that dialog.
    const { uploadFile } = useMediaLit({
        signatureEndpoint: `${address.backend}/api/media/presigned`,
        access: "private",
        onUploadComplete: (media) => setPhoto(media as unknown as Media),
    });
    const pasteImage = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
        if (!canAttach || paste.kind === "uploading") return;
        const image = Array.from(event.clipboardData?.files || []).find(
            (file) => file.type.startsWith("image/"),
        );
        if (!image) return; // Ordinary text pastes into the draft as usual.
        event.preventDefault();
        setPaste({ kind: "uploading" });
        try {
            const extension = image.type.split("/")[1] || "png";
            const file = image.name
                ? image
                : new File([image], `pasted-image.${extension}`, {
                      type: image.type,
                  });
            await uploadFile(file, { caption: "", type: "page" });
            setPaste({ kind: "idle" });
        } catch {
            setPaste({ kind: "error", message: copy.pasteFailed });
        }
    };
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

    const submit = async () => {
        if (
            !text.trim() ||
            status.kind === "sending" ||
            paste.kind === "uploading"
        )
            return;
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
        <form
            onSubmit={(event) => event.preventDefault()}
            className="kk-comment-form"
        >
            <DialogTitle className="sr-only">{copy.comment}</DialogTitle>
            <DialogDescription className="sr-only">
                {selection.label}
            </DialogDescription>
            <header className="kk-comment-header border-b">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copy.close}
                    onClick={onClose}
                >
                    <X />
                </Button>
                <span className="min-w-0 flex-1 break-words text-sm">
                    {copy.comment}
                </span>
                <Button
                    type="button"
                    onClick={submit}
                    aria-label={
                        status.kind === "sending"
                            ? copy.sending
                            : copy.sendLabel
                    }
                    disabled={
                        !text.trim() ||
                        status.kind === "sending" ||
                        paste.kind === "uploading"
                    }
                >
                    {status.kind === "sending" ? copy.sending : copy.send}
                </Button>
            </header>
            <div className="kk-comment-body">
                <label className="grid gap-2 text-sm font-medium">
                    {copy.commentLabel}
                    <textarea
                        autoFocus
                        required
                        maxLength={4000}
                        rows={6}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onPaste={pasteImage}
                        className="w-full rounded-lg border bg-background p-3 text-base font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    />
                </label>
                <p className="text-sm text-muted-foreground">{copy.privacy}</p>
                {canAttach && (
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
                {canAttach && paste.kind === "uploading" && (
                    <p role="status" className="text-sm text-muted-foreground">
                        {copy.pasting}
                    </p>
                )}
                {canAttach && paste.kind === "error" && (
                    <p role="alert" className="text-sm text-destructive">
                        {paste.message}
                    </p>
                )}
                {canAttach && paste.kind === "idle" && (
                    <p className="text-sm text-muted-foreground">
                        {copy.pasteHint}
                    </p>
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
                </div>
            </div>
        </form>
    );
}
