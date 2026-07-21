"use client";

import { useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Download } from "lucide-react";
import { FetchBuilder } from "@courselit/utils";
import type { Lesson } from "@courselit/common-models";
import { Image, Skeleton } from "@courselit/components-library";
import { TextRenderer } from "@courselit/page-blocks";
import { Header1, Header2 } from "@courselit/page-primitives";
import { emptyDoc as TextEditorEmptyDoc } from "@courselit/text-editor";
import { TableOfContent } from "@components/table-of-content";
import WidgetErrorBoundary from "@components/public/base-layout/template/widget-error-boundary";
import { useMediaTeardown } from "@components/public/use-media-teardown";
import { AddressContext, ThemeContext } from "@components/contexts";
import { Button } from "@components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@components/ui/tooltip";
import {
    LESSON_TYPE_AUDIO,
    LESSON_TYPE_PDF,
    LESSON_TYPE_TEXT,
    LESSON_TYPE_VIDEO,
} from "@/ui-config/constants";
import { getCourseViewerSessionParams } from "@/lib/course-viewer-session-params";
import type { CourseFrontend } from "./helpers";

/**
 * The single lean page for a purchased download-type product (Al's mock,
 * 2026-07-20): breadcrumb (product), lesson title, player with a download
 * button on the same baseline, hero image, description. No sidebar, no
 * intro/lesson split, no completion apparatus — a store-bought virtual good.
 *
 * Handles N files: with one lesson the lesson title is the page's Header1
 * under a muted product breadcrumb; with several, the product title is the
 * Header1 (breadcrumb would duplicate it) and each file row gets a Header2.
 */
export default function DownloadProductContent({
    product,
}: {
    product: CourseFrontend;
}) {
    const { theme } = useContext(ThemeContext);
    const lessons = [...product.groups]
        .sort((a, b) => a.rank - b.rank)
        .flatMap((group) => group.lessons);
    const single = lessons.length === 1;
    const descriptionJson = product.description
        ? JSON.parse(product.description)
        : TextEditorEmptyDoc;

    return (
        <div className="flex w-full flex-col gap-8 pb-[100px] lg:max-w-[40rem] xl:max-w-[48rem] mx-auto">
            {single ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BookOpen className="h-4 w-4 shrink-0" />
                    {product.title}
                </div>
            ) : (
                <Header1 theme={theme.theme} className="text-foreground">
                    {product.title}
                </Header1>
            )}
            {lessons.map((lesson) => (
                <DownloadLessonRow
                    key={lesson.lessonId}
                    lessonId={lesson.lessonId}
                    productId={product.courseId}
                    single={single}
                />
            ))}
            {product.featuredImage && (
                <div className="flex justify-center">
                    <div className="w-full md:max-w-screen-md">
                        <Image
                            alt={product.featuredImage.caption}
                            src={product.featuredImage.file!}
                            loading="eager"
                            sizes="50vw"
                        />
                    </div>
                </div>
            )}
            <div className="flex flex-col gap-4 text-foreground">
                <TableOfContent json={descriptionJson} theme={theme.theme} />
                <WidgetErrorBoundary widgetName="text-editor">
                    <TextRenderer json={descriptionJson} theme={theme.theme} />
                </WidgetErrorBoundary>
            </div>
        </div>
    );
}

function Caption({ text }: { text: string }) {
    if (!text) {
        return null;
    }
    return (
        <div className="flex justify-center">
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    );
}

function DownloadButton({ href, name }: { href: string; name?: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    asChild
                >
                    <a href={href} aria-label={`Download ${name || "file"}`}>
                        <Download className="h-5 w-5" />
                    </a>
                </Button>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
        </Tooltip>
    );
}

function DownloadLessonRow({
    lessonId,
    productId,
    single,
}: {
    lessonId: string;
    productId: string;
    single: boolean;
}) {
    const address = useContext(AddressContext);
    const { theme } = useContext(ThemeContext);
    const searchParams = useSearchParams();
    const viewerSessionParams = getCourseViewerSessionParams(searchParams);
    const [lesson, setLesson] = useState<Lesson | undefined>();
    const [error, setError] = useState<string | undefined>();
    const setMediaRef = useMediaTeardown();

    useEffect(() => {
        const query = `
            query ($lessonId: String!, $productId: String!, $preview: Boolean) {
                lesson: getLessonDetails(id: $lessonId, courseId: $productId, preview: $preview) {
                    lessonId,
                    title,
                    downloadable,
                    type,
                    content,
                    media {
                        file,
                        caption,
                        originalFileName,
                        mediaId
                    },
                    courseId
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query,
                variables: {
                    lessonId,
                    productId,
                    preview: viewerSessionParams.preview,
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        fetch
            .exec()
            .then((response) => {
                if (response.lesson) {
                    setLesson(response.lesson);
                } else {
                    setError("unavailable");
                }
            })
            .catch(() => setError("unavailable"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lessonId, productId, viewerSessionParams.preview]);

    if (error) {
        return (
            <p className="text-sm text-muted-foreground">
                This item isn&apos;t available right now.
            </p>
        );
    }

    if (!lesson) {
        return (
            <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-14 w-full" />
            </div>
        );
    }

    const media = lesson.media;
    const mediaId = media?.mediaId;
    const canDownload = Boolean(lesson.downloadable && mediaId);
    const downloadHref = mediaId
        ? `/api/media/${encodeURIComponent(mediaId)}`
        : "";
    const captionText = media?.caption ?? media?.originalFileName ?? "";
    const lessonType = String(lesson.type ?? "").toLowerCase();
    // Native players render UA-chrome; keep it matched to the active theme
    // without touching global color-scheme (which would restyle scrollbars
    // and inputs everywhere).
    const mediaClassName =
        "w-full [color-scheme:light] dark:[color-scheme:dark]";

    return (
        <div className="flex flex-col gap-4">
            {single ? (
                <Header1 theme={theme.theme} className="text-foreground">
                    {lesson.title}
                </Header1>
            ) : (
                <Header2 theme={theme.theme} className="text-foreground">
                    {lesson.title}
                </Header2>
            )}
            {lessonType === LESSON_TYPE_AUDIO && (
                <div className="flex items-center gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <audio
                            ref={setMediaRef}
                            controls
                            controlsList="nodownload"
                            onContextMenu={(e) => e.preventDefault()}
                            className={mediaClassName}
                        >
                            <source
                                src={(media?.file as string) || undefined}
                                type="audio/mpeg"
                            />
                            Your browser does not support the audio tag.
                        </audio>
                        <Caption text={captionText} />
                    </div>
                    {canDownload && (
                        <DownloadButton
                            href={downloadHref}
                            name={media?.originalFileName}
                        />
                    )}
                </div>
            )}
            {lessonType === LESSON_TYPE_VIDEO && (
                <div className="flex flex-col gap-2">
                    <video
                        ref={setMediaRef}
                        controls
                        controlsList="nodownload"
                        onContextMenu={(e) => e.preventDefault()}
                        className={mediaClassName}
                    >
                        <source
                            src={(media?.file as string) || undefined}
                            type="video/mp4"
                        />
                        Your browser does not support the video tag.
                    </video>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <Caption text={captionText} />
                        </div>
                        {canDownload && (
                            <DownloadButton
                                href={downloadHref}
                                name={media?.originalFileName}
                            />
                        )}
                    </div>
                </div>
            )}
            {lessonType === LESSON_TYPE_PDF && (
                <div className="flex flex-col gap-2">
                    <iframe
                        src={`${media?.file}#toolbar=0`}
                        className="h-[70vh] w-full"
                        title={lesson.title}
                    />
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <Caption text={captionText} />
                        </div>
                        {canDownload && (
                            <DownloadButton
                                href={downloadHref}
                                name={media?.originalFileName}
                            />
                        )}
                    </div>
                </div>
            )}
            {lessonType === LESSON_TYPE_TEXT && lesson.content && (
                <div className="text-foreground">
                    <WidgetErrorBoundary widgetName="text-editor">
                        <TextRenderer
                            json={
                                typeof lesson.content === "string"
                                    ? JSON.parse(lesson.content as string)
                                    : lesson.content
                            }
                            theme={theme.theme}
                        />
                    </WidgetErrorBoundary>
                </div>
            )}
            {![
                LESSON_TYPE_AUDIO,
                LESSON_TYPE_VIDEO,
                LESSON_TYPE_PDF,
                LESSON_TYPE_TEXT,
            ].includes(lessonType as never) &&
                canDownload && (
                    <div className="flex items-center gap-3">
                        <Button variant="outline" asChild>
                            <a href={downloadHref}>
                                <Download className="mr-2 h-4 w-4" />
                                {media?.originalFileName || lesson.title}
                            </a>
                        </Button>
                    </div>
                )}
        </div>
    );
}
