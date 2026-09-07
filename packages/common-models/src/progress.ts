export interface ScormData {
    lessons?: Record<string, { cmi: Record<string, unknown> }>;
}

export interface Progress {
    courseId: string;
    completedLessons: string[];
    downloaded?: boolean;
    accessibleGroups: string[];
    /** Read-only projection from the retention ledger; never a stored grant. */
    retainedLessonIds?: string[];
    lastDripAt?: Date;
    certificateId?: string;
    scormData?: ScormData;
    createdAt?: Date;
    updatedAt?: Date;
}
