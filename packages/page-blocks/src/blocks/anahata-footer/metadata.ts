import { WidgetMetadata, Constants } from "@courselit/common-models";
const { PageType } = Constants;

const metadata: WidgetMetadata = {
    name: "anahataFooter",
    displayName: "Anahata Footer",
    // Hoists this block into the site-wide footer slot instead of letting it
    // flow inline, and makes it shareable across every page.
    role: "footer",
    compatibleWith: [
        PageType.SITE,
        PageType.PRODUCT,
        PageType.BLOG,
        PageType.COMMUNITY,
    ],
};

export default metadata;
