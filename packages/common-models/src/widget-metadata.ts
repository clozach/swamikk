import {
    PageTypeBlog,
    PageTypeProduct,
    PageTypeSite,
    PageTypeCommunity,
} from ".";

type PageType =
    | PageTypeProduct
    | PageTypeSite
    | PageTypeBlog
    | PageTypeCommunity;

/**
 * The structural slot a widget occupies in a page template.
 *
 * Widgets without a role flow inline with the rest of the page. A widget that
 * declares `header` or `footer` is hoisted out of the page body and rendered in
 * that slot instead — which is what makes it shareable across every page.
 *
 * This exists so alternative headers/footers can be authored as ordinary blocks
 * rather than by editing the template. Before it, the template resolved the two
 * slots by hardcoded widget name, so there could only ever be one of each.
 */
export type WidgetRole = "header" | "footer";

export default interface WidgetMetadata {
    name: string;
    displayName: string;
    compatibleWith: PageType[];
    icon?: string;
    role?: WidgetRole;
}
