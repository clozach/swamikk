import type { InternalCohort } from "@courselit/orm-models";
import { CohortSchema } from "@courselit/orm-models";
import mongoose, { Model } from "mongoose";

const CohortModel =
    (mongoose.models.Cohort as Model<InternalCohort> | undefined) ||
    mongoose.model<InternalCohort>("Cohort", CohortSchema);

export type { InternalCohort };
export default CohortModel;
