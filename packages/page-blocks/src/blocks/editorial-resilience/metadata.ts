import { WidgetMetadata, Constants } from "@courselit/common-models";

const { PageType } = Constants;

const metadata: WidgetMetadata = {
    name: "editorialResilience",
    displayName: "Editorial — Resilience",
    // PRODUCT is the one that matters (the resilience course sales page);
    // SITE is offered so the feature can also headline a standalone page.
    compatibleWith: [PageType.PRODUCT, PageType.SITE],
};

export default metadata;
