import { WidgetMetadata, Constants } from "@courselit/common-models";
const { PageType } = Constants;

const metadata: WidgetMetadata = {
    name: "anahataHero",
    displayName: "Anahata Hero",
    compatibleWith: [PageType.SITE, PageType.PRODUCT, PageType.COMMUNITY],
};

export default metadata;
