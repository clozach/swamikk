import type {
    MeetingAnswerInput,
    MeetingAnswerSaveResult,
    MeetingQuestionsSnapshot,
} from "@courselit/common-models";
import { meetingQuestionsUi as copy } from "@config/strings";

export async function loadMeetingQuestions(): Promise<MeetingQuestionsSnapshot> {
    const response = await fetch("/api/meeting-questions", {
        credentials: "same-origin",
        cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok)
        throw Object.assign(new Error(data.error?.message || copy.loadFailed), {
            status: response.status,
        });
    return data;
}

export async function saveMeetingAnswer(
    input: MeetingAnswerInput,
): Promise<MeetingAnswerSaveResult> {
    const response = await fetch("/api/meeting-questions/answers", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const data = await response.json();
    if (response.status === 409 && data.kind === "conflict") return data;
    if (!response.ok)
        throw Object.assign(new Error(data.error?.message || copy.saveFailed), {
            status: response.status,
        });
    return data;
}
