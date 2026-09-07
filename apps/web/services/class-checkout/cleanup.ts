import { requireAccountErasureReady } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { CheckoutReservation } from "./reservation";

/** Intent/booking financial audit remains. Only account reservation metadata is erased after all writers finish. */
export async function deleteUserClassCheckoutReservations(
    domain: string,
    userId: string,
) {
    await requireAccountErasureReady({ domainId: domain, userId });
    await CheckoutReservation.deleteMany({
        domain,
        userId,
        "state.kind": "idle",
    });
}
