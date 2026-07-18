import { WidgetMetadata, Constants } from "@courselit/common-models";
const { PageType } = Constants;

const metadata: WidgetMetadata = {
    name: "anahataPosts",
    displayName: "Anahata Recent Posts",
    compatibleWith: [PageType.SITE, PageType.PRODUCT, PageType.BLOG],
};

export default metadata;
