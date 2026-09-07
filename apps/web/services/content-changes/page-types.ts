import type { WidgetInstance } from "@courselit/common-models";
import type { Page } from "@/models/Page";
import type { PageContentChangeReceipt } from "@courselit/common-models";
export type {
    PageWidgetTarget,
    PageWidgetPatch,
    PageWidgetSnapshot,
    PageWidgetBaseline,
    PageWidgetField,
} from "@courselit/common-models";
export type EditablePage = Page & {
    __v?: number;
    layout: WidgetInstance[];
    contentChangeReceipt?: PageContentChangeReceipt;
};
