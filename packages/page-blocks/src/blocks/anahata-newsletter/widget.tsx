import React, { FormEvent, useEffect, useRef, useState } from "react";
import { WidgetProps } from "@courselit/common-models";
import type { SectionBackground, ThemeStyle } from "@courselit/page-models";
import { Section } from "@courselit/page-primitives";
import { FetchBuilder } from "@courselit/utils";
import Settings from "./settings";
import {
    BORDER_WARM,
    CALLOUT_INK,
    CARD,
    DEFAULT_BACKGROUND,
    DEFAULT_BODY,
    DEFAULT_BUTTON_CAPTION,
    DEFAULT_DISCLAIMER,
    DEFAULT_EMAIL_LABEL,
    DEFAULT_EMAIL_PLACEHOLDER,
    DEFAULT_HEADING,
    DEFAULT_INVALID_EMAIL_MESSAGE,
    DEFAULT_MISSING_EMAIL_MESSAGE,
    DEFAULT_SUBMISSION_ERROR_MESSAGE,
    DEFAULT_SUBSCRIBE_LINK,
    DEFAULT_SUBSCRIBE_MODE,
    DEFAULT_SUCCESS_MESSAGE,
    DEFAULT_VERTICAL_PADDING,
    FEEDBACK_ERROR,
    FEEDBACK_SUCCESS,
    FONT_BODY,
    FONT_DISPLAY,
    INK,
    INK_STRONG,
} from "./defaults";

/**
 * The band's interaction has exactly five states, so it is a tagged union
 * rather than a bag of `isSubmitting` / `hasError` / `didSucceed` booleans:
 * "submitting and invalid at the same time" cannot be represented, and
 * "invalid" (bad input, never left the browser) is kept distinct from
 * "error" (a real request reached the server and failed) — they need
 * different copy and different `aria-invalid` handling on the field.
 */
type SubmissionState =
    | { kind: "idle" }
    | { kind: "invalid"; message: string }
    | { kind: "submitting" }
    | { kind: "subscribed"; message: string }
    | { kind: "error"; message: string };

/**
 * The exact mutation the stock `email-form` block (metadata name
 * "newsletter-signup") sends to createSubscription — same resolver, same
 * persistence (upsert-by-email onto the `users` collection with
 * `lead: "newsletter"`, never a duplicate). Sent with real GraphQL
 * variables rather than the stock block's string-interpolated query, so a
 * `"` or newline in the address can't break the request — `/api/graph`
 * supports both shapes (see route.ts's `typeof body.query === "string"`
 * branch).
 */
const SUBSCRIBE_MUTATION = `
    mutation Subscribe($name: String!, $email: String!) {
        response: createSubscription(name: $name, email: $email)
    }
`;

/** Deliberately permissive — the browser's own `type=email` grammar. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The saffron/rust button recipe (visual spec §0.6, tokens.css `.an-button`).
 *
 * The hexes are written out literally rather than interpolated from the
 * palette constants because Tailwind's scanner is static — a computed class
 * name would never make it into `dist/index.css`. They mirror SAFFRON, RUST
 * and RUST_PRESSED in ./defaults; keep the two in step.
 *
 * White text was unconditional here, which paired fine with the rust/
 * rust-pressed hover/active grounds (7.43:1 / 9.79:1) but failed at rest,
 * where the ground is still saffron (2.14:1). Rest now uses cocoa (7.24:1);
 * `hover:`/`active:` restore white explicitly rather than relying on any
 * implicit carry-over, since a keyboard Enter/Space press fires `:active`
 * without `:hover`.
 *
 * Disabled state (while a real submission is in flight) is a solid fill,
 * not `opacity-*`: this button sits directly on the band's photo
 * background with no card behind it, so any translucency lets the photo
 * bleed through and makes the resulting contrast a function of whatever
 * pixels happen to be there — exactly the un-guaranteed case flagged in
 * the AA pass. `#545454` (tokens --ink) with white text is 8.21:1, opaque,
 * photo-independent regardless of what the disabled button sits on top of.
 */
const BUTTON_CLASSES = [
    "inline-block max-w-full min-w-[200px] cursor-pointer select-none",
    "rounded-[10px] border-none px-[20px] py-[15px]",
    "text-center text-[16px] font-bold capitalize leading-[1.2] text-[#312110] no-underline",
    "bg-[#ff9900] hover:bg-[#993300] hover:text-white active:bg-[#7a2900] active:text-white active:translate-y-[1px]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]",
    "transition-[background-color,color,transform] duration-100 ease-in",
    "disabled:cursor-not-allowed disabled:pointer-events-none",
    "disabled:bg-[#545454] disabled:text-white",
    "disabled:hover:bg-[#545454] disabled:hover:text-white",
    "disabled:active:bg-[#545454] disabled:active:text-white disabled:active:translate-y-0",
].join(" ");

function paragraphsOf(body: string): string[] {
    return body
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

export default function Widget({
    settings: {
        heading,
        body,
        subscribeMode,
        emailLabel,
        emailPlaceholder,
        buttonCaption,
        subscribeLink,
        subscribeLinkOpensInNewTab,
        successMessage,
        missingEmailMessage,
        invalidEmailMessage,
        submissionErrorMessage,
        disclaimer,
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme, address },
    editing,
    nextTheme,
    id,
}: WidgetProps<Settings>): JSX.Element {
    const overiddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overiddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overiddenTheme.structure.section.padding.y =
        verticalPadding || DEFAULT_VERTICAL_PADDING;

    const resolvedBackground: SectionBackground =
        background || DEFAULT_BACKGROUND;

    const mode = subscribeMode || DEFAULT_SUBSCRIBE_MODE;
    const caption = buttonCaption || DEFAULT_BUTTON_CAPTION;
    const label = emailLabel || DEFAULT_EMAIL_LABEL;
    // `??` rather than `||` for the two long-form fields: an untouched setting
    // gets the Anahata copy, but a deliberately emptied one stays empty rather
    // than springing back to the default.
    const title = (heading ?? DEFAULT_HEADING).trim();
    const copy = paragraphsOf(body ?? DEFAULT_BODY);
    const smallPrint = (disclaimer ?? DEFAULT_DISCLAIMER).trim();

    const [email, setEmail] = useState("");
    const [submission, setSubmission] = useState<SubmissionState>({
        kind: "idle",
    });
    const inputRef = useRef<HTMLInputElement | null>(null);
    const feedbackRef = useRef<HTMLParagraphElement | null>(null);
    // Guards against a slow in-flight request resolving after the
    // component has unmounted (e.g. the admin navigates away mid-request).
    const mounted = useRef(true);
    useEffect(
        () => () => {
            mounted.current = false;
        },
        [],
    );

    const fieldId = `${id || "anahata-newsletter"}-email`;
    const feedbackId = `${fieldId}-feedback`;

    // Completion (success or a real server-side error) moves focus to the
    // status message, same as a native form's error summary would. Client
    // validation ("invalid") intentionally does NOT go through here — that
    // path already returns focus straight to the offending field, below.
    useEffect(() => {
        if (submission.kind === "subscribed" || submission.kind === "error") {
            feedbackRef.current?.focus();
        }
    }, [submission.kind]);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (submission.kind === "submitting") {
            return;
        }

        // Keyboard users land back on the field they have to correct.
        const reject = (message: string) => {
            setSubmission({ kind: "invalid", message });
            inputRef.current?.focus();
        };

        const candidate = email.trim();
        if (!candidate) {
            reject(missingEmailMessage || DEFAULT_MISSING_EMAIL_MESSAGE);
            return;
        }
        if (!EMAIL_PATTERN.test(candidate)) {
            reject(invalidEmailMessage || DEFAULT_INVALID_EMAIL_MESSAGE);
            return;
        }

        setSubmission({ kind: "submitting" });

        // The page-builder overlay (EditableWidget) already sits on top of
        // this whole widget and swallows the click while `editing` is true,
        // so a real submit can't reach here in practice. Guarded anyway —
        // belt-and-braces so editing a page can never create a subscriber.
        if (editing) {
            setSubmission({
                kind: "subscribed",
                message: successMessage || DEFAULT_SUCCESS_MESSAGE,
            });
            return;
        }

        const request = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query: SUBSCRIBE_MUTATION,
                variables: { name: "", email: candidate },
            })
            .setIsGraphQLEndpoint(true)
            .build();

        let succeeded = false;
        try {
            const response = await request.exec();
            // createSubscription is a boolean resolver: true covers both a
            // brand-new subscriber and an address that was already on the
            // list (server upserts by email — see graphql/mails/logic.ts).
            // Either way the user sees the same success message; we never
            // reveal which case it was, and no duplicate is ever created.
            succeeded = response?.response === true;
        } catch {
            succeeded = false;
        }

        if (!mounted.current) {
            return;
        }

        if (succeeded) {
            setEmail("");
            setSubmission({
                kind: "subscribed",
                message: successMessage || DEFAULT_SUCCESS_MESSAGE,
            });
        } else {
            setSubmission({
                kind: "error",
                message:
                    submissionErrorMessage || DEFAULT_SUBMISSION_ERROR_MESSAGE,
            });
        }
    };

    const onEmailChange = (value: string) => {
        setEmail(value);
        if (submission.kind !== "idle" && submission.kind !== "submitting") {
            setSubmission({ kind: "idle" });
        }
    };

    // Only client-side validation marks the field itself invalid. A
    // server-side "error" means the address was fine and the request
    // failed for other reasons — the field shouldn't be flagged.
    const isInvalid = submission.kind === "invalid";
    const isSubmitting = submission.kind === "submitting";
    const isSubmissionError = submission.kind === "error";
    const feedback =
        submission.kind === "invalid" ||
        submission.kind === "subscribed" ||
        submission.kind === "error"
            ? {
                  message: submission.message,
                  color:
                      submission.kind === "subscribed"
                          ? FEEDBACK_SUCCESS
                          : FEEDBACK_ERROR,
              }
            : submission.kind === "submitting"
              ? { message: "Submitting…", color: INK }
              : null;

    return (
        <Section
            theme={overiddenTheme}
            id={cssId}
            background={resolvedBackground}
            nextTheme={nextTheme as "dark" | "light"}
            className="mb-[10px]"
        >
            <div
                className="pb-[45px] pt-[40px] text-center text-[16px] leading-[1.65] md:text-[18px]"
                style={{ fontFamily: FONT_BODY, color: CALLOUT_INK }}
            >
                {title && (
                    <h3
                        className="m-0 p-0 text-[30px] font-normal uppercase leading-[1.2]"
                        style={{ fontFamily: FONT_DISPLAY, color: INK_STRONG }}
                    >
                        {title}
                    </h3>
                )}

                {copy.length > 0 && (
                    <div className="mt-[0.75em]">
                        {copy.map((paragraph, index) => (
                            <p
                                key={index}
                                className="mx-auto mb-[0.75em] mt-0 max-w-[46em]"
                            >
                                {paragraph}
                            </p>
                        ))}
                    </div>
                )}

                {mode === "link" ? (
                    <div className="mt-[20px]">
                        <a
                            href={subscribeLink || DEFAULT_SUBSCRIBE_LINK}
                            className={BUTTON_CLASSES}
                            {...(subscribeLinkOpensInNewTab
                                ? {
                                      target: "_blank",
                                      rel: "noopener noreferrer",
                                  }
                                : {})}
                        >
                            {caption}
                        </a>
                    </div>
                ) : (
                    <form
                        onSubmit={onSubmit}
                        noValidate
                        aria-busy={isSubmitting}
                        className="mx-auto mt-[20px] flex w-full max-w-[520px] flex-col items-stretch gap-[10px] min-[480px]:flex-row"
                    >
                        <label htmlFor={fieldId} className="sr-only">
                            {label}
                        </label>
                        <input
                            ref={inputRef}
                            id={fieldId}
                            name="email"
                            type="email"
                            autoComplete="email"
                            inputMode="email"
                            value={email}
                            placeholder={
                                emailPlaceholder || DEFAULT_EMAIL_PLACEHOLDER
                            }
                            disabled={isSubmitting}
                            aria-invalid={isInvalid}
                            aria-describedby={feedback ? feedbackId : undefined}
                            onChange={(e) => onEmailChange(e.target.value)}
                            /* Focus ring was saffron — 2.14:1 against the white
                               field, under the 3:1 UI-component floor. Rust is
                               7.43:1 against the same white field. */
                            className="w-full min-w-0 flex-1 rounded-[4px] border px-[12px] py-[6px] text-left text-[1em] leading-[1.65] outline-none placeholder:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#993300] disabled:cursor-not-allowed"
                            style={{
                                fontFamily: FONT_BODY,
                                backgroundColor: CARD,
                                color: INK,
                                borderColor: isInvalid
                                    ? FEEDBACK_ERROR
                                    : BORDER_WARM,
                            }}
                        />
                        <button
                            type="submit"
                            className={BUTTON_CLASSES}
                            disabled={isSubmitting}
                            aria-disabled={isSubmitting}
                            style={{ fontFamily: FONT_BODY }}
                        >
                            {isSubmitting ? "Submitting…" : caption}
                        </button>
                    </form>
                )}

                <div role="status" aria-live="polite">
                    {feedback && (
                        <p
                            ref={feedbackRef}
                            id={feedbackId}
                            tabIndex={-1}
                            className="mx-auto mb-0 mt-[20px] max-w-[520px] rounded-[4px] border p-[20px] text-center text-[18px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]"
                            style={{
                                backgroundColor: CARD,
                                borderColor: isSubmissionError
                                    ? FEEDBACK_ERROR
                                    : BORDER_WARM,
                                color: feedback.color,
                            }}
                        >
                            {feedback.message}
                        </p>
                    )}
                </div>

                {smallPrint && (
                    <p className="mx-auto mt-[15px] max-w-[520px] text-[0.8em] opacity-80">
                        {smallPrint}
                    </p>
                )}
            </div>
        </Section>
    );
}
