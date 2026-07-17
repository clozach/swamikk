export interface CohortSchedule {
    startAt?: Date;
    endAt?: Date;
}

export interface Cohort {
    cohortId: string;
    name: string;
    courseId: string;
    members: string[];
    schedule?: CohortSchedule;
    createdAt?: Date;
    updatedAt?: Date;
}
