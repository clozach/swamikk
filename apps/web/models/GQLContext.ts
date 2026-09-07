import { InternalUser } from "@courselit/orm-models";
import { Domain } from "./Domain";
import type { MemberMimicContext } from "@courselit/common-models";

export default interface GQLContext {
    user: InternalUser;
    subdomain: Domain;
    address: string;
    actor?: InternalUser;
    memberMimic?: MemberMimicContext;
}
