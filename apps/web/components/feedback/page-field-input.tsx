import type {
    Address,
    Media,
    PageWidgetField,
    PageWidgetPatch,
    Profile,
    TextEditorContent,
} from "@courselit/common-models";
import { MediaSelector } from "@courselit/components-library";
import { pageEditCopy as copy } from "./page-edit-copy";

export function initialPagePatch(field: PageWidgetField): PageWidgetPatch {
    if (field.kind === "text")
        return { kind: "text", text: String(field.value) };
    if (field.kind === "rich-text")
        return { kind: "rich-text", content: field.value as TextEditorContent };
    const image = field.value as {
        source?: { media?: Media };
        mediaId?: string;
        alt?: string;
        caption?: string;
    };
    return {
        kind: "image",
        mediaId: image.source?.media?.mediaId || image.mediaId || "",
        alt: image.alt || image.caption || "",
    };
}

type TextLeaf = { path: number[]; text: string };
export function textLeaves(
    node: { type?: unknown; text?: unknown; content?: unknown },
    path: number[] = [],
): TextLeaf[] {
    if (node.type === "text")
        return [{ path, text: typeof node.text === "string" ? node.text : "" }];
    return (Array.isArray(node.content) ? node.content : []).flatMap(
        (child, i) => textLeaves(child, [...path, i]),
    );
}
export function replaceLeaf(
    doc: TextEditorContent,
    path: number[],
    text: string,
): TextEditorContent {
    const next = JSON.parse(JSON.stringify(doc));
    let node = next;
    for (const index of path) node = node.content[index];
    node.text = text;
    return next;
}

export default function PageFieldInput({
    patch,
    onChange,
    profile,
    address,
}: {
    patch: PageWidgetPatch;
    onChange: (patch: PageWidgetPatch) => void;
    profile: Profile;
    address: Address;
}) {
    if (patch.kind === "text")
        return (
            <label className="grid gap-2">
                Replacement text
                <textarea
                    value={patch.text}
                    maxLength={20000}
                    rows={6}
                    className="rounded-lg border bg-background p-3"
                    onChange={(event) =>
                        onChange({ ...patch, text: event.target.value })
                    }
                />
            </label>
        );
    if (patch.kind === "rich-text")
        return (
            <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                    Edit the text below. Existing formatting, links and embedded
                    material are retained; the preview shows the result.
                </p>
                {textLeaves(patch.content).map((leaf, i) => (
                    <label key={leaf.path.join(".")} className="grid gap-2">
                        Text {i + 1}
                        <textarea
                            value={leaf.text}
                            maxLength={20000}
                            rows={3}
                            className="rounded-lg border bg-background p-3"
                            onChange={(event) =>
                                onChange({
                                    kind: "rich-text",
                                    content: replaceLeaf(
                                        patch.content,
                                        leaf.path,
                                        event.target.value,
                                    ),
                                })
                            }
                        />
                    </label>
                ))}
                {!textLeaves(patch.content).length && (
                    <p>
                        This field has no existing text. Leave a comment to
                        request a larger change.
                    </p>
                )}
            </div>
        );
    if (patch.kind !== "image") return null;
    return (
        <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{copy.imageAccess}</p>
            <MediaSelector
                title={copy.image}
                src=""
                srcTitle=""
                hidePreview
                profile={profile}
                address={address}
                mediaId={patch.mediaId || undefined}
                onSelection={(media: Media) =>
                    onChange({ ...patch, mediaId: media.mediaId! })
                }
                strings={{}}
                access="public"
                type="page"
                mimeTypesToShow={[
                    "image/png",
                    "image/jpeg",
                    "image/webp",
                    "image/gif",
                    "image/avif",
                ]}
            />
            {patch.mediaId && (
                <p className="text-sm">
                    A library image is selected. Prepare its preview to compare
                    it with the current image.
                </p>
            )}
            <label className="grid gap-2">
                {copy.alt}
                <textarea
                    value={patch.alt}
                    maxLength={1000}
                    rows={2}
                    className="rounded-lg border bg-background p-3"
                    onChange={(event) =>
                        onChange({ ...patch, alt: event.target.value })
                    }
                />
            </label>
        </div>
    );
}
