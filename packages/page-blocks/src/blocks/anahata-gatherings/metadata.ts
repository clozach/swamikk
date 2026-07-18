import { WidgetMetadata, Constants } from "@courselit/common-models";
const { PageType } = Constants;

const metadata: WidgetMetadata = {
    name: "anahataGatherings",
    displayName: "Anahata Upcoming Gatherings",
    compatibleWith: [
        PageType.SITE,
        PageType.PRODUCT,
        PageType.BLOG,
        PageType.COMMUNITY,
    ],
};

export default metadata;
