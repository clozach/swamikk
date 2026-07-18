import { WidgetDefaultSettings } from "@courselit/common-models";

/**
 * How the band asks for the subscription.
 *
 * - "form": inline email field + Subscribe button — validates client-side,
 *   then submits to the same `createSubscription` GraphQL mutation the
 *   stock `email-form` block uses (see widget.tsx).
 * - "link": the real anahata-retreat.org.nz behaviour — a single Subscribe
 *   button linking out to the newsletter page.
 *
 * Tagged rather than a pair of booleans so "form and link at once" and
 * "neither" are unrepresentable.
 */
export type SubscribeMode = "form" | "link";

export default interface Settings extends WidgetDefaultSettings {
    /** Playfair Display, uppercase heading. Default: "Stay in Touch". */
    heading?: string;
    /** Body copy. Blank lines separate paragraphs. */
    body?: string;

    /** Which subscription affordance to render. Default: "form". */
    subscribeMode?: SubscribeMode;

    /** Label for the email field (visually hidden, read by screen readers). */
    emailLabel?: string;
    /** Placeholder shown inside the email field. */
    emailPlaceholder?: string;
    /** Caption on the Subscribe button (both modes). */
    buttonCaption?: string;
    /** Destination when subscribeMode is "link". */
    subscribeLink?: string;
    /** Opens `subscribeLink` in a new tab when subscribeMode is "link". */
    subscribeLinkOpensInNewTab?: boolean;

    /** Inline confirmation shown after the server confirms the subscription. */
    successMessage?: string;
    /** Shown when the field is left empty. */
    missingEmailMessage?: string;
    /** Shown when the value is not a plausible email address. */
    invalidEmailMessage?: string;
    /**
     * Shown when the subscription request reaches the server but fails
     * (network error, or the server rejects it). Distinct from the two
     * messages above, which are client-side validation and never touch
     * the network.
     */
    submissionErrorMessage?: string;

    /** Small print under the form. Leave blank to hide. */
    disclaimer?: string;

    cssId?: string;
}
