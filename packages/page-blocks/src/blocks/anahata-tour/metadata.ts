import { WidgetMetadata, Constants } from "@courselit/common-models";
const { PageType } = Constants;

const metadata: WidgetMetadata = {
    name: "anahataTour",
    displayName: "Anahata 3D Tour",
    compatibleWith: [
        PageType.SITE,
        PageType.PRODUCT,
        PageType.COMMUNITY,
        PageType.BLOG,
    ],
};

export default metadata;
