import { WidgetDefaultSettings } from "@courselit/common-models";

/**
 * Anahata footer — settings model.
 *
 * Every string, image path, link and repeated item that appears in the
 * rendered footer is represented here so it can be edited from the page
 * builder. Nothing in `widget.tsx` is hard-coded copy.
 *
 * Shapes are tagged unions rather than optional-field bags so illegal
 * combinations (a "links" column carrying an email address, a disabled
 * back-to-top control that still claims a scroll threshold) cannot be
 * represented at all.
 */

/** Socials the real site links out to, in the order it lists them. */
export type SocialPlatform = "facebook" | "instagram" | "youtube" | "vimeo";

export interface FooterLink {
    /** Stable key for React + drag-and-drop reordering. */
    id: string;
    label: string;
    href: string;
}

export interface SocialLink {
    id: string;
    platform: SocialPlatform;
    href: string;
}

/**
 * A column of uppercase menu links separated by the ocean hairline —
 * "Anahata Site" and "Gatherings" on the real site.
 */
export interface LinksColumn {
    kind: "links";
    id: string;
    /** Playfair Display, uppercase, 30px. Rendered only when non-empty. */
    title: string;
    links: FooterLink[];
}

/**
 * The identity column: logo, name, postal address, email and socials.
 * On the real site this is a text widget, so it has no 30px column
 * title — `title` stays empty unless the editor sets one.
 */
export interface ContactColumn {
    kind: "contact";
    id: string;
    title: string;
    logoUrl: string;
    logoAlt: string;
    /** Natural pixel size of the footer logo (150 x 168 on the real site). */
    logoWidth: number;
    logoHeight: number;
    /** 18px, sentence case — "Anahata Yoga Retreat". */
    heading: string;
    /** One physical line each; rendered <br>-separated. */
    addressLines: string[];
    /** Bold label preceding the address — "Email". */
    emailLabel: string;
    email: string;
    socials: SocialLink[];
}

export type FooterColumn = LinksColumn | ContactColumn;

/**
 * Back-to-top control. Disabled carries no configuration, so a stale
 * threshold can never linger behind an off switch.
 */
export type BackToTop =
    | { enabled: false }
    | {
          enabled: true;
          /** Screen-reader label for the icon-only button. */
          label: string;
          /** Pixels of scroll before the control fades in (100 on the real site). */
          revealAfter: number;
      };

export default interface Settings extends WidgetDefaultSettings {
    columns?: FooterColumn[];

    /* --- ground --- */
    /** Ocean. The one cool place in the palette. */
    groundColor?: string;
    /** White, on the ocean ground. */
    textColor?: string;
    /** Lightened ocean used for the menu-list rules. */
    hairlineColor?: string;

    /* --- decorative edges --- */
    decorLeftUrl?: string;
    decorRightUrl?: string;

    /* --- measure --- */
    /** Inner container width in px (1024 on the real site). */
    innerMaxWidth?: number;
    paddingTop?: number;
    paddingBottom?: number;

    /* --- copyright strip --- */
    copyrightGroundColor?: string;
    copyrightPrefix?: string;
    /** Bolded owner name following the prefix. */
    copyrightOwner?: string;
    copyrightLinkPrefix?: string;
    /** Bolded studio name inside the credit link. */
    copyrightLinkLabel?: string;
    copyrightLinkHref?: string;

    /* --- chrome --- */
    backToTop?: BackToTop;
    cssId?: string;
}
