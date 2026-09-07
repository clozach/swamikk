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
    /** Existing internal cohorts are private until an administrator explicitly lists them. */
    checkoutState?: "private" | "listed-closed" | "listed-open";
    checkoutRevision?: number;
    createdAt?: Date;
    updatedAt?: Date;
}
