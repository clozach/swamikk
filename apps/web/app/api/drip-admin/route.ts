import type { NextRequest } from "next/server";
import {
    apiResponse,
    requestContext,
    requireSameOrigin,
    readBoundedJson,
    limitRequest,
} from "@/services/content-changes/http";
import { requireNoMimic } from "@/services/drip-admin/guard";
import { listDripCourses, readDripCourse } from "@/services/drip-admin/read";
import { createDripChange } from "@/services/drip-admin/changes";
import { dripId } from "@/services/drip-admin/validation";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        requireNoMimic(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "drip-read", 120);
        const courseId = req.nextUrl.searchParams.get("courseId");
        return courseId
            ? { course: await readDripCourse(dripId.parse(courseId), ctx) }
            : { courses: await listDripCourses(ctx) };
    });
}
export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        requireNoMimic(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "drip-create");
        return {
            change: await createDripChange(
                await readBoundedJson(req, 32 * 1024),
                ctx,
            ),
        };
    }, 201);
}
