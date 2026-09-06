/**
 * Which page blocks fill the site-wide header and footer slots.
 *
 * New pages are seeded with these names, and `initSharedWidgets` provisions
 * their shared settings. They exist as constants because the names were
 * previously written as string literals in eleven places, which meant a site
 * could never use anything but the two stock blocks.
 *
 * A replacement block must declare the matching `role` in its metadata (see
 * `WidgetMetadata.role`) so the template hoists it into the right slot, and be
 * registered as `shared` in `ui-config/widgets.tsx`.
 *
 * Overridable by env so a deployment can swap its chrome without a code change.
 */
export const SITE_HEADER_WIDGET = process.env.SITE_HEADER_WIDGET || "header";
export const SITE_FOOTER_WIDGET = process.env.SITE_FOOTER_WIDGET || "footer";

/**
 * The names that satisfy each structural slot when a layout is validated or
 * its shared settings are copied: the configured chrome block, plus the stock
 * block's name so a layout stored before the swap still saves.
 */
export const headerBlockNames = (header: string = SITE_HEADER_WIDGET) =>
    Array.from(new Set([header, "header"]));
export const footerBlockNames = (footer: string = SITE_FOOTER_WIDGET) =>
    Array.from(new Set([footer, "footer"]));

export const isHeaderBlock = (
    name: string | undefined,
    header: string = SITE_HEADER_WIDGET,
) => !!name && headerBlockNames(header).includes(name);
export const isFooterBlock = (
    name: string | undefined,
    footer: string = SITE_FOOTER_WIDGET,
) => !!name && footerBlockNames(footer).includes(name);
export const isSiteChromeBlock = (
    name: string | undefined,
    header: string = SITE_HEADER_WIDGET,
    footer: string = SITE_FOOTER_WIDGET,
) => isHeaderBlock(name, header) || isFooterBlock(name, footer);

/** A page layout is saveable only when both structural slots are filled. */
export const hasMandatoryBlocks = (
    layout: Array<{ name?: string }>,
    header: string = SITE_HEADER_WIDGET,
    footer: string = SITE_FOOTER_WIDGET,
) =>
    layout.some((w) => isHeaderBlock(w?.name, header)) &&
    layout.some((w) => isFooterBlock(w?.name, footer));
