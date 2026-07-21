import { NextRequest, NextResponse } from "next/server";
import { getMedia } from "@/services/medialit";
import { Constants, type Media } from "@courselit/common-models";
import { auth } from "@/auth";
import DomainModel, { Domain } from "@models/Domain";
import UserModel from "@models/User";
import LessonModel from "@models/Lesson";
import { isEnrolled } from "@/ui-lib/utils";
import { isPartOfDripGroup } from "@/graphql/lessons/helpers";

const UPSTREAM_FETCH_TIMEOUT_MS = 30_000;

/**
 * RFC 6266 Content-Disposition: an ASCII-safe quoted fallback plus the
 * RFC 5987 filename* form. The stored originalFileName is upload-supplied
 * metadata — quotes would break the quoted-string, and any control or
 * non-ASCII char (an em dash, say) makes Headers#set throw.
 */
function contentDispositionAttachment(name?: string | null): string {
    const raw = (name || "").trim() || "file";
    const fallback =
        raw
            .replace(/[^\x20-\x7E]/g, "_")
            .replace(/["\\]/g, "")
            .trim() || "file";
    const encoded = encodeURIComponent(raw).replace(
        /['()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Stream the (trusted, medialit-issued) file URL back as an attachment. */
async function streamAsAttachment(media: Media): Promise<NextResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        UPSTREAM_FETCH_TIMEOUT_MS,
    );
    let response: Response;
    try {
        response = await fetch(media.file!, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    const headers = new Headers();
    headers.set(
        "Content-Type",
        response.headers.get("Content-Type") ||
            media.mimeType ||
            "application/octet-stream",
    );
    const contentLength = response.headers.get("Content-Length");
    if (contentLength) {
        headers.set("Content-Length", contentLength);
    }
    headers.set(
        "Content-Disposition",
        contentDispositionAttachment(media.originalFileName),
    );

    return new NextResponse(response.body, { status: 200, headers });
}

/** Uniform not-found: unauthorized is indistinguishable from missing. */
function mediaNotFound(): NextResponse {
    return new NextResponse("Media not found", { status: 404 });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ mediaId: string }> },
) {
    const mediaId = (await params).mediaId;

    if (!mediaId) {
        return new NextResponse("Missing mediaId parameter", { status: 400 });
    }

    try {
        // A nonexistent mediaId must be indistinguishable from a denied one,
        // and the medialit client throws on unknown ids — resolve to the
        // same uniform 404 instead of letting it surface as a 500.
        const media = await getMedia(mediaId).catch(() => null);

        if (!media || !media.file) {
            return mediaNotFound();
        }

        if (media.access === Constants.MediaAccessType.PUBLIC) {
            return await streamAsAttachment(media);
        }

        // PRIVATE media: authorization comes only from domain-scoped Mongo
        // state (the medialit record above is a global lookup — it supplies
        // the file URL and filename, never the authorization decision).
        const domain = await DomainModel.findOne<Domain>({
            name: request.headers.get("domain"),
        });
        if (!domain) {
            return mediaNotFound();
        }

        const session = await auth.api.getSession({
            headers: request.headers,
        });
        if (!session?.user?.email) {
            return mediaNotFound();
        }

        const user = await UserModel.findOne({
            email: session.user.email,
            domain: domain._id,
            active: true,
        });
        if (!user) {
            return mediaNotFound();
        }

        // One media record can back lessons in several courses (the demo
        // content reuses files), so gather every owning lesson and grant the
        // download if ANY of them passes the full gate. Per lesson, server-
        // side and independent of any client-side button logic: the author's
        // downloadable flag and published state are enforced, enrollment is
        // required UNCONDITIONALLY (requiresEnrollment only governs the
        // in-app viewer), and dripped groups stay locked until released.
        const lessons = await LessonModel.find({
            "media.mediaId": mediaId,
            domain: domain._id,
        });

        let authorized = false;
        for (const lesson of lessons) {
            try {
                if (!lesson.downloadable || !lesson.published) {
                    continue;
                }
                if (!isEnrolled(lesson.courseId, user)) {
                    continue;
                }
                if (await isPartOfDripGroup(lesson, domain._id)) {
                    const progress = user.purchases?.find(
                        (purchase: { courseId: string }) =>
                            purchase.courseId === lesson.courseId,
                    );
                    if (
                        !progress ||
                        progress.accessibleGroups.indexOf(lesson.groupId) === -1
                    ) {
                        continue;
                    }
                }
                authorized = true;
                break;
            } catch {
                // an orphaned lesson (missing course) can't authorize —
                // skip it rather than failing the whole request
                continue;
            }
        }
        if (!authorized) {
            return mediaNotFound();
        }

        return await streamAsAttachment(media);
    } catch (error) {
        console.error("Error downloading file:", error);
        return new NextResponse("Error downloading file", { status: 500 });
    }
}
