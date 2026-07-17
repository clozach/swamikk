import constants from "@config/constants";
import GQLContext from "@models/GQLContext";
import { checkPermission } from "@courselit/utils";
import { checkIfAuthenticated } from "../../lib/graphql";
import { responses } from "../../config/strings";

const { permissions } = constants;

export const cohortTagPrefix = "cohort:";

export const cohortTag = (cohortId: string) => `${cohortTagPrefix}${cohortId}`;

export const assertCanManageCohorts = (ctx: GQLContext) => {
    checkIfAuthenticated(ctx);

    if (!checkPermission(ctx.user.permissions, [permissions.manageUsers])) {
        throw new Error(responses.action_not_allowed);
    }
};
