import { Metadata, ResolvingMetadata } from "next";
import { getFullSiteSetup } from "@ui-lib/utils";
import { headers } from "next/headers";
import { FetchBuilder } from "@courselit/utils";
import { notFound, redirect } from "next/navigation";
import { Constants } from "@courselit/common-models";
import LayoutWithSidebar from "./layout-with-sidebar";
import LeanDownloadLayout from "./lean-download-layout";
import { getProduct } from "./helpers";
import { getAddressFromHeaders } from "@/app/actions";
import {
    COURSE_VIEWER_CURRENT_URL_HEADER,
    appendCourseViewerSessionParamsToHref,
    getCourseViewerSessionParamsFromUrl,
} from "@/lib/course-viewer-session-params";

/**
 * True when the proxy-reported viewer URL points at a lesson sub-route
 * (/course/[slug]/[id]/[lesson]) rather than the intro or the discussions
 * overlay. Download-type products collapse to a single lean page, so lesson
 * deep-links (old bookmarks, stale emails) bounce back to the intro.
 */
function isLessonSubPath(viewerUrl: string | null): boolean {
    if (!viewerUrl) {
        return false;
    }
    try {
        const segments = new URL(viewerUrl, "http://localhost").pathname
            .split("/")
            .filter(Boolean);
        return (
            segments.length === 4 &&
            segments[0] === "course" &&
            segments[3] !== "discussions"
        );
    } catch {
        return false;
    }
}

export async function generateMetadata(
    props: { params: Promise<{ slug: string; id: string }> },
    parent: ResolvingMetadata,
): Promise<Metadata> {
    const params = await props.params;
    const requestHeaders = await headers();
    const viewerSessionParams = getCourseViewerSessionParamsFromUrl(
        requestHeaders.get(COURSE_VIEWER_CURRENT_URL_HEADER),
    );
    const address = await getAddressFromHeaders(headers);
    const siteInfo = await getFullSiteSetup(address);

    if (!siteInfo) {
        return {
            title: `${(await parent)?.title?.absolute}`,
        };
    }

    try {
        const query = `
            query ($id: String!, $preview: Boolean) {
                course: getCourse(id: $id, preview: $preview) {
                    title
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address}/api/graph`)
            .setPayload({
                query,
                variables: {
                    id: params.id,
                    preview: viewerSessionParams.preview,
                },
            })
            .setHeaders({
                cookie: requestHeaders.get("cookie") ?? "",
            })
            .setIsGraphQLEndpoint(true)
            .build();
        const response = await fetch.exec();
        const course = response.course;
        const parentTitle = (await parent)?.title?.absolute;

        if (!course?.title) {
            notFound();
        }

        return {
            title: parentTitle
                ? `${course.title} | ${parentTitle}`
                : course.title,
        };
    } catch (error) {
        notFound();
    }
}

export default async function Layout(props: {
    children: React.ReactNode;
    params: Promise<{ slug: string; id: string }>;
}) {
    const params = await props.params;

    const { children } = props;

    const { id } = params;
    const requestHeaders = await headers();
    const viewerSessionParams = getCourseViewerSessionParamsFromUrl(
        requestHeaders.get(COURSE_VIEWER_CURRENT_URL_HEADER),
    );
    const address = await getAddressFromHeaders(headers);
    let product;

    try {
        product = await getProduct(
            id,
            address,
            Boolean(viewerSessionParams.preview),
            {
                cookie: requestHeaders.get("cookie") ?? "",
            },
        );
    } catch (error) {
        notFound();
    }

    if (product.type === Constants.CourseType.DOWNLOAD) {
        // One lean page, no intro/lesson split: bounce lesson deep-links back
        // to the intro. redirect() must stay outside the try/catch above —
        // it throws NEXT_REDIRECT, which the catch would turn into a 404.
        if (
            isLessonSubPath(
                requestHeaders.get(COURSE_VIEWER_CURRENT_URL_HEADER),
            )
        ) {
            redirect(
                appendCourseViewerSessionParamsToHref(
                    `/course/${params.slug}/${id}`,
                    viewerSessionParams,
                ),
            );
        }
        return (
            <LeanDownloadLayout product={product}>
                {children}
            </LeanDownloadLayout>
        );
    }

    return <LayoutWithSidebar product={product}>{children}</LayoutWithSidebar>;
}
