import type { NextRequest } from "next/server";
import {
    limitRequest,
    readBoundedJson,
    requireSameOrigin,
} from "@/services/content-changes/http";
import {
    meetingContext,
    meetingResponse,
} from "@/services/meeting-questions/http";
import { readMeetingQuestions } from "@/services/meeting-questions/views";
import { upsertQuestionSet } from "@/services/meeting-questions/sets";
import { questionSetWriteSchema } from "@/services/meeting-questions/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    return meetingResponse(async () => {
        const ctx = await meetingContext(req);
        await limitRequest(req, ctx, "meeting-question-read", 120);
        return readMeetingQuestions(ctx);
    });
}

export async function POST(req: NextRequest) {
    return meetingResponse(async () => {
        requireSameOrigin(req);
        const ctx = await meetingContext(req);
        await limitRequest(req, ctx, "meeting-question-write", 60);
        const input = questionSetWriteSchema.parse(
            await readBoundedJson(req, 128 * 1024),
        );
        return { set: await upsertQuestionSet(input, ctx) };
    });
}
