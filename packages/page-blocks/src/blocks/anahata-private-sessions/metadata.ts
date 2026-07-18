import { WidgetMetadata, Constants } from "@courselit/common-models";

const { PageType } = Constants;

const metadata: WidgetMetadata = {
    name: "anahataPrivateSessions",
    displayName: "Anahata Private Sessions",
    compatibleWith: [PageType.SITE, PageType.PRODUCT, PageType.COMMUNITY],
};

export default metadata;
