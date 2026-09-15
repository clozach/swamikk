import { COMMUNITIES_ENABLED } from "@config/release-features";
import { UserFilter } from "@courselit/common-models";
import {
    USER_FILTER_CATEGORY_EMAIL,
    USER_FILTER_CATEGORY_LAST_ACTIVE,
    USER_FILTER_CATEGORY_PERMISSION,
    USER_FILTER_CATEGORY_PRODUCT,
    USER_FILTER_CATEGORY_SIGNED_UP,
    USER_FILTER_CATEGORY_SUBSCRIPTION,
    USER_FILTER_CATEGORY_TAGGED,
    USER_FILTER_CATEGORY_COMMUNITY,
} from "@ui-config/strings";

const categoriesMap: Partial<Record<UserFilter["name"], string>> = {
    email: USER_FILTER_CATEGORY_EMAIL,
    product: USER_FILTER_CATEGORY_PRODUCT,
    ...(COMMUNITIES_ENABLED
        ? { community: USER_FILTER_CATEGORY_COMMUNITY }
        : {}),
    lastActive: USER_FILTER_CATEGORY_LAST_ACTIVE,
    signedUp: USER_FILTER_CATEGORY_SIGNED_UP,
    subscription: USER_FILTER_CATEGORY_SUBSCRIPTION,
    tag: USER_FILTER_CATEGORY_TAGGED,
    permission: USER_FILTER_CATEGORY_PERMISSION,
};

export default categoriesMap;
