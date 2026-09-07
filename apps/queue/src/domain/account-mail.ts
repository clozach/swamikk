import { withAccountMail } from "../../../../packages/common-logic/src/account-lifecycle/mail";
import { AccountLifecycleError } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { MembershipAccessModel } from "../../../../packages/common-logic/src/member-access/models";
import { MailJob } from "./model/mail-job";

/** Old drip jobs have a stable ledger identity; ordinary legacy jobs do not. */
export async function withMailAccounts<T>(
    input: {
        domainId: string;
        to: string[];
        account?: unknown;
        drip?: unknown;
    },
    operation: () => Promise<T>,
): Promise<T | undefined> {
    const account =
        input.account === undefined
            ? undefined
            : MailJob.shape.account.parse(input.account);
    const drip =
        input.drip === undefined
            ? undefined
            : MailJob.shape.drip.parse(input.drip);
    try {
        let userId = account?.userId;
        if (drip) {
            const period = await MembershipAccessModel.findOne({
                domain: input.domainId,
                id: drip.periodId,
            })
                .select("userId")
                .lean();
            if (!period || (userId && userId !== period.userId)) return;
            userId = period.userId;
        }
        if (!userId) return operation();
        return await withAccountMail(
            {
                domainId: input.domainId,
                userId,
                actorUserId: account?.actorUserId,
            },
            input.to,
            operation,
        );
    } catch (error) {
        if (error instanceof AccountLifecycleError) return;
        throw error;
    }
}
