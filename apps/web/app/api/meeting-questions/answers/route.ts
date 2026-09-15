import type { NextRequest } from "next/server";
import type { MeetingAnswerSaveResult } from "@courselit/common-models";
import {
    limitRequest,
    readBoundedJson,
    requireSameOrigin,
} from "@/services/content-changes/http";
import {
    meetingContext,
    meetingResponse,
} from "@/services/meeting-questions/http";
import { saveMeetingAnswer } from "@/services/meeting-questions/answers";
import { answerInputSchema } from "@/services/meeting-questions/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    let result: MeetingAnswerSaveResult | undefined;
    const response = await meetingResponse(async () => {
        requireSameOrigin(req);
        const ctx = await meetingContext(req);
        await limitRequest(req, ctx, "meeting-answer-write", 60);
        const input = answerInputSchema.parse(
            await readBoundedJson(req, 12 * 1024),
        );
        result = await saveMeetingAnswer(input, ctx);
        return result;
    });
    if (result?.kind === "conflict")
        return Response.json(result, {
            status: 409,
            headers: { "Cache-Control": "private, no-store" },
        });
    return response;
}
