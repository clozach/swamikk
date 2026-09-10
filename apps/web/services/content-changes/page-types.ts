import type { WidgetInstance } from "@courselit/common-models";
import type { Page } from "@/models/Page";
import type {
    PageContentChangeReceipt,
    PageWidgetField as SharedPageWidgetField,
} from "@courselit/common-models";
export type {
    PageWidgetTarget,
    PageWidgetPatch,
    PageWidgetSnapshot,
    PageWidgetBaseline,
} from "@courselit/common-models";
/**
 * A listed field. `placeholder` is present only when the stored image is a
 * waiting-for-asset well (`{ kind: "placeholder", description }` in the
 * shared image source); its description is the photo idea the replacement
 * fulfils. The value itself is still the stored well, so an ordinary image
 * patch replaces it like any other picture.
 */
export type PageWidgetField = SharedPageWidgetField & {
    placeholder?: { description: string };
};
export type EditablePage = Page & {
    __v?: number;
    layout: WidgetInstance[];
    contentChangeReceipt?: PageContentChangeReceipt;
};
