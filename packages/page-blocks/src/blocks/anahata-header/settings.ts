import { Media, WidgetDefaultSettings } from "@courselit/common-models";
import type { ImageSource } from "../../components/image-source";

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
    /** Pins the header to the top of the viewport while the page scrolls,
     *  matching the live anahata-retreat.org.nz. On by default; Karuna can
     *  turn it off from the Advanced panel. */
    sticky?: boolean;
    /** Show the light/dark switch at the end of the nav. */
    showThemeToggle?: boolean;
    /** Accessible name for that switch. */
    themeToggleLabel?: string;

    /** Where the 40 × 40 mark comes from: a URL, a media-library item, or a
     *  placeholder (the waiting-for-asset well) — the shared tagged union, so
     *  "url and media both set" is unrepresentable. Absent on layouts saved
     *  before the union: those fold `logoMedia` + `logoSrc` into one source
     *  at read time (see `logo-source.ts`). */
    logoSource?: ImageSource;
    /** Legacy — logo picked from the media library. Read only when
     *  `logoSource` is absent; wins over `logoSrc`. */
    logoMedia?: Media;
    /** Legacy — static logo path. Read only when `logoSource` is absent. */
    logoSrc?: string;
    /** Accessible name of the home link ("Swami Karma Karuna — home"). */
    logoAlt?: string;
    /** Intrinsic pixel dimensions — the chip's box, image or well alike. */
    logoWidth?: number;
    logoHeight?: number;
    /** The name typeset beside the chip (Playfair). Visually hidden ≤479px,
     *  where the chip alone carries the brand. */
    brandName?: string;
    /** Where the logo links to. */
    homeHref?: string;

    /** Pine-dark utility strip above the header band. */
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

    /** Label on the signed-out sign-in control (top-right). The destinations
     *  and signed-in labels are fixed CourseLit routes, so only this one is
     *  exposed. Defaults to "Log in". */
    accountLoginLabel?: string;

    cssId?: string;
}
