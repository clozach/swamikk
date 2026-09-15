import { requireFeedbackAdmin } from "../content-changes/http";
import type {
    MeetingQuestionAnswer,
    MeetingQuestionSet,
    MeetingQuestionViewer,
    MeetingQuestionsSnapshot,
} from "@courselit/common-models";
import type {
    InternalMeetingQuestionSet,
    InternalMeetingQuestionAnswer,
} from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import UserModel from "@/models/User";
import { MeetingQuestionSetModel, MeetingQuestionAnswerModel } from "./models";

export function meetingViewer(ctx: GQLContext): MeetingQuestionViewer {
    return { userId: ctx.user.userId, name: ctx.user.name || "Administrator" };
}

export function setView(
    record: InternalMeetingQuestionSet,
): MeetingQuestionSet {
    return {
        id: record.id,
        title: record.title,
        intro: record.intro,
        questions: [...record.questions].sort((a, b) => a.number - b.number),
        revision: record.revision,
        updatedAt: record.updatedAt.toISOString(),
    };
}

export function answerView(
    record: InternalMeetingQuestionAnswer,
    authors: Map<string, MeetingQuestionViewer>,
): MeetingQuestionAnswer {
    const author = record.authorId ? authors.get(record.authorId) : undefined;
    return {
        id: record.id,
        setId: record.setId,
        questionId: record.questionId,
        author: author ? { kind: "account", ...author } : { kind: "removed" },
        text: record.text,
        revision: record.revision,
        history: record.history.map((entry) => ({ ...entry })),
        updatedAt: record.updatedAt.toISOString(),
    };
}

export async function readMeetingQuestions(
    ctx: GQLContext,
): Promise<MeetingQuestionsSnapshot> {
    requireFeedbackAdmin(ctx);
    const domain = ctx.subdomain._id;
    const [records, answers] = await Promise.all([
        MeetingQuestionSetModel.find({ domain }).sort({ id: 1 }).lean(),
        MeetingQuestionAnswerModel.find({ domain })
            .sort({ createdAt: 1, id: 1 })
            .lean(),
    ]);
    const authorIds = answers.flatMap((answer) =>
        answer.authorId ? [answer.authorId] : [],
    );
    const users = await UserModel.find({ domain, userId: { $in: authorIds } })
        .select("userId name")
        .lean();
    const authors = new Map<string, MeetingQuestionViewer>(
        users.map((user) => [
            String(user.userId),
            {
                userId: String(user.userId),
                name: String(user.name || "Administrator"),
            },
        ]),
    );
    const sets = records.map(setView);
    const numbers = new Map(
        sets.flatMap((set) =>
            set.questions.map(
                (question) =>
                    [`${set.id}:${question.id}`, question.number] as const,
            ),
        ),
    );
    return {
        sets,
        answers: answers
            .map((answer) => answerView(answer, authors))
            .sort(
                (a, b) =>
                    a.setId.localeCompare(b.setId) ||
                    (numbers.get(`${a.setId}:${a.questionId}`) || 0) -
                        (numbers.get(`${b.setId}:${b.questionId}`) || 0),
            ),
        viewer: meetingViewer(ctx),
    };
}
