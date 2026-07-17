export interface CohortSchedule {
    startAt?: number | null;
    endAt?: number | null;
}

export default interface Cohort {
    cohortId: string;
    name: string;
    courseId: string;
    members: string[];
    schedule?: CohortSchedule | null;
    createdAt?: string;
}
