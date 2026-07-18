import { WidgetMetadata, Constants } from "@courselit/common-models";
const { PageType } = Constants;

const metadata: WidgetMetadata = {
    name: "anahataHeader",
    displayName: "Anahata Header",
    // Hoists this block into the site-wide header slot instead of letting it
    // flow inline, and makes it shareable across every page.
    role: "header",
    compatibleWith: [
        PageType.SITE,
        PageType.PRODUCT,
        PageType.BLOG,
        PageType.COMMUNITY,
    ],
};

export default metadata;
