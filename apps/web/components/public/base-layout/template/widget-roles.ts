import widgets from "@/ui-config/widgets";
import { Footer, Header } from "@courselit/page-blocks";
import type { WidgetRole } from "@courselit/common-models";

/**
 * Resolves which structural slot a widget occupies.
 *
 * Prefers the `role` declared in the widget's own metadata, so an alternative
 * header or footer can be authored as an ordinary block. Falls back to the two
 * built-in names for widgets predating `role` (and for layouts stored before
 * this field existed).
 */
export function roleOf(widgetName: string | undefined): WidgetRole | undefined {
    if (!widgetName) return undefined;

    const declared = widgets[widgetName]?.metadata?.role as
        | WidgetRole
        | undefined;
    if (declared) return declared;

    if (widgetName === Header.metadata.name) return "header";
    if (widgetName === Footer.metadata.name) return "footer";
    return undefined;
}

export const isHeaderWidget = (widgetName: string | undefined) =>
    roleOf(widgetName) === "header";

export const isFooterWidget = (widgetName: string | undefined) =>
    roleOf(widgetName) === "footer";

/** True for any widget hoisted out of the page body into a structural slot. */
export const isStructuralWidget = (widgetName: string | undefined) =>
    roleOf(widgetName) !== undefined;
