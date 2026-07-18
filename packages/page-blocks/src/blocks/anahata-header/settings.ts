import { Media, WidgetDefaultSettings } from "@courselit/common-models";

/**
 * A single navigation entry. `children` is recursive so the editor can express
 * the real Anahata tree, which is three levels deep (About > Yoga > Hatha).
 * An entry with `children` still carries its own `href` — the top-level "Shop"
 * link goes to /products *and* opens a dropdown, exactly like the live site.
 */
export interface MenuItem {
    id: string;
    label: string;
    href: string;
    children?: MenuItem[];
}

/** A utility-strip entry (Cart / Search / Menu / Contact). Never nested. */
export interface TopBarItem {
    id: string;
    label: string;
    href: string;
}

export default interface Settings extends WidgetDefaultSettings {
    /** Logo picked from the media library. Wins over `logoSrc` when set. */
    logoMedia?: Media;
    /** Static logo path, e.g. the staged `/anahata/logo-2021.png`. */
    logoSrc?: string;
    logoAlt?: string;
    /** Intrinsic pixel dimensions — used for the aspect box, not for display. */
    logoWidth?: number;
    logoHeight?: number;
    /** Where the logo links to. */
    homeHref?: string;

    /** Cocoa utility strip above the header band. */
    showTopBar?: boolean;
    topBarLeftItems?: TopBarItem[];
    topBarRightItems?: TopBarItem[];

    /** The main navigation tree. */
    menu?: MenuItem[];

    /** Mobile bar (<=767px) copy. */
    mobileMenuLabel?: string;
    mobileCtaLabel?: string;
    mobileCtaHref?: string;
    mobileCloseLabel?: string;

    cssId?: string;
}
