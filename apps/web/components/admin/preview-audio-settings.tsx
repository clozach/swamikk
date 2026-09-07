"use client";

import { useContext, useEffect, useState } from "react";
import {
    MediaSelector,
    MediaPlayer,
    useToast,
} from "@courselit/components-library";
import { Media, Profile } from "@courselit/common-models";
import { AddressContext, ProfileContext } from "@components/contexts";
import { useGraphQLFetch } from "@/hooks/use-graphql-fetch";
import { Button } from "@/components/ui/button";
import { catalogMediaUi, mediaPlayerUi } from "@/config/strings";

export function PreviewAudioSettings({ courseId }: { courseId: string }) {
    const address = useContext(AddressContext);
    const { profile } = useContext(ProfileContext);
    const fetch = useGraphQLFetch();
    const { toast } = useToast();
    const [selected, setSelected] = useState<Media | undefined>();
    const [status, setStatus] = useState<"loading" | "ready" | "saving">(
        "loading",
    );
    const [error, setError] = useState("");

    useEffect(() => {
        let alive = true;
        fetch
            .setPayload({
                query: `query ($id: String!) { getCourse(id: $id, preview: true) {
                previewAudio { mediaId file originalFileName mimeType access size thumbnail }
            } }`,
                variables: { id: courseId },
            })
            .build()
            .exec()
            .then((result) => {
                if (alive) {
                    setSelected(result.getCourse?.previewAudio ?? undefined);
                    setStatus("ready");
                }
            })
            .catch((err) => {
                if (alive) setError(err.message);
            });
        return () => {
            alive = false;
        };
    }, [courseId, fetch]);

    const save = async () => {
        setStatus("saving");
        setError("");
        try {
            await fetch
                .setPayload({
                    query: `mutation ($id: String!, $mediaId: String) {
                    updateCourse(courseData: { id: $id, previewAudioMediaId: $mediaId }) { courseId }
                }`,
                    variables: {
                        id: courseId,
                        mediaId: selected?.mediaId ?? null,
                    },
                })
                .build()
                .exec();
            toast({ title: catalogMediaUi.previewSaved });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setStatus("ready");
        }
    };

    return (
        <section className="space-y-4">
            <h2 className="text-base font-semibold">
                {catalogMediaUi.previewSetting}
            </h2>
            <p className="text-sm text-muted-foreground">
                {catalogMediaUi.previewHelp}
            </p>
            {status !== "loading" && (
                <MediaSelector
                    title={catalogMediaUi.previewSetting}
                    src={selected?.thumbnail || ""}
                    srcTitle={selected?.originalFileName || ""}
                    mediaId={selected?.mediaId || ""}
                    mimeTypesToShow={[
                        "audio/mp3",
                        "audio/mpeg",
                        "audio/mp4",
                        "audio/wav",
                        "audio/ogg",
                    ]}
                    access="public"
                    profile={profile as Profile}
                    address={address}
                    strings={{}}
                    type="course"
                    onSelection={(media) => setSelected(media)}
                    onRemove={() => setSelected(undefined)}
                />
            )}
            {selected?.file && (
                <MediaPlayer
                    kind="audio"
                    compact
                    src={selected.file}
                    title={catalogMediaUi.preview}
                    labels={mediaPlayerUi}
                />
            )}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <Button
                onClick={() => {
                    void save();
                }}
                disabled={status !== "ready"}
            >
                {status === "saving"
                    ? catalogMediaUi.savingPreview
                    : catalogMediaUi.savePreview}
            </Button>
        </section>
    );
}
