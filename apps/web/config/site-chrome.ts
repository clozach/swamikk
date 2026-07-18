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
