import { WidgetMetadata, Constants } from "@courselit/common-models";
const { PageType } = Constants;

const metadata: WidgetMetadata = {
    name: "anahataNewsletter",
    displayName: "Anahata Stay in Touch",
    compatibleWith: [
        PageType.SITE,
        PageType.PRODUCT,
        PageType.BLOG,
        PageType.COMMUNITY,
    ],
};

export default metadata;
