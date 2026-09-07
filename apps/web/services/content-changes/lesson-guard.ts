import type { Lesson } from "@/models/Lesson";
import { fingerprint } from "./stable";

const mutableFields = [
    "title",
    "content",
    "media",
    "downloadable",
    "requiresEnrollment",
    "published",
    "type",
    "creatorId",
    "courseId",
    "groupId",
] as const;

export function lessonRevision(lesson: Lesson): number {
    return (lesson as Lesson & { __v?: number }).__v || 0;
}

export function lessonFingerprint(lesson: Lesson): string {
    return fingerprint(
        Object.fromEntries(
            mutableFields.map((key) => [
                key,
                JSON.parse(JSON.stringify(lesson[key] ?? null)),
            ]),
        ),
    );
}

export function lessonWriteFilter(lesson: Lesson) {
    return {
        domain: lesson.domain,
        lessonId: lesson.lessonId,
        $and: [
            lessonRevision(lesson) === 0
                ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
                : { __v: lessonRevision(lesson) },
            ...mutableFields.map((key) => ({
                [key]: { $eq: lesson[key] ?? null },
            })),
        ],
    };
}
