import type { BlockImage, ImageSource } from "./settings";

const url = (value: string): ImageSource => ({ kind: "url", url: value });

/* ---- photographs (staged same-origin under apps/web/public/editorial/) ---- */
export const coverImage: BlockImage = {
    source: url("/editorial/forest-meditation-sq.jpg"),
    alt: "A practitioner sitting in meditation in the New Zealand bush",
};
export const mountainsImage: BlockImage = {
    source: url("/editorial/mountains-band.jpg"),
    alt: "The mountains of New Zealand",
};
export const namasteImage: BlockImage = {
    source: url("/editorial/namaste-band.jpg"),
    alt: "Practitioners in prayer, hands at heart",
};
export const portraitImage: BlockImage = {
    source: url("/editorial/swami-band.jpg"),
    alt: "Portrait of Swami Karma Karuna Saraswati",
};
export const signatureImage: BlockImage = {
    source: url("/editorial/swami-sig.png"),
    alt: "Signature of Swami Karma Karuna",
};

/* ---- enrolment call to action ---- */
export const enrolCaption = "Enrol Now";
/**
 * Deep-links straight into the resilience course checkout (courseId
 * UdMMb-qi21roGPY16kBiP — NZD $247 one-time). Carried over from the page's
 * previous hero/cta blocks so the button still lands on the buyer's path.
 */
export const enrolAction = "/checkout?type=course&id=UdMMb-qi21roGPY16kBiP";
