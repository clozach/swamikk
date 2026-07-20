import { Media, WidgetDefaultSettings } from "@courselit/common-models";

/**
 * Where a picture comes from.
 *
 * EITHER a hand-typed URL (the staged editorial assets live at same-origin
 * `/editorial/<file>`) OR an item picked from the media library — never both,
 * never neither. The tagged union keeps the "url set but media also set" state
 * unrepresentable. Mirrors the anahata-hero block's `ImageSource`.
 */
export type ImageSource =
    | { kind: "url"; url: string }
    | { kind: "media"; media: Partial<Media> };

export interface BlockImage {
    source: ImageSource;
    /** Empty string is legitimate — it marks the image decorative. */
    alt: string;
}

/**
 * The Editorial — Resilience block is a single fixed magazine feature for the
 * 2026 Building Resilience course. Its long-form copy is baked into the
 * render verbatim from the course spec, so the only editable settings are the
 * handful of photographs and the enrolment call-to-action target.
 */
export default interface Settings extends WidgetDefaultSettings {
    /** Square cover photograph beside the title. */
    coverImage?: BlockImage;
    /** First full-bleed figure band (mountains). */
    mountainsImage?: BlockImage;
    /** Second full-bleed figure band (namaste / hands at heart). */
    namasteImage?: BlockImage;
    /** Portrait beside the teacher profile. */
    portraitImage?: BlockImage;
    /** Signature under the profile. */
    signatureImage?: BlockImage;
    /** Enrol button caption. */
    enrolCaption?: string;
    /** Enrol button target — the course checkout URL. */
    enrolAction?: string;
    cssId?: string;
}
