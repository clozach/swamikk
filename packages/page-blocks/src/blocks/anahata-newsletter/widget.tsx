import React, { FormEvent, useEffect, useRef, useState } from "react";
import { WidgetProps } from "@courselit/common-models";
import type { SectionBackground, ThemeStyle } from "@courselit/page-models";
import { Section } from "@courselit/page-primitives";
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
 * The band's interaction has exactly four modes, so it is a tagged union
 * rather than a bag of `isSubmitting` / `hasError` / `didSucceed` booleans:
 * "submitting and invalid at the same time" cannot be represented.
 */
type SubmissionState =
    | { kind: "idle" }
    | { kind: "invalid"; message: string }
    | { kind: "submitting" }
    | { kind: "subscribed"; message: string };

/** Deliberately permissive — the browser's own `type=email` grammar. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Cosmetic latency so the button's disabled/pressed states are perceivable. */
const FAKE_ROUNDTRIP_MS = 450;

/**
 * The saffron/rust button recipe (visual spec §0.6, tokens.css `.an-button`).
 *
 * The hexes are written out literally rather than interpolated from the
 * palette constants because Tailwind's scanner is static — a computed class
 * name would never make it into `dist/index.css`. They mirror SAFFRON, RUST
 * and RUST_PRESSED in ./defaults; keep the two in step.
 */
const BUTTON_CLASSES = [
    "inline-block max-w-full min-w-[200px] cursor-pointer select-none",
    "rounded-[10px] border-none px-[20px] py-[15px]",
    "text-center text-[16px] font-bold capitalize leading-[1.2] text-white no-underline",
    "bg-[#ff9900] hover:bg-[#993300] active:bg-[#7a2900] active:translate-y-[1px]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]",
    "transition-[background-color,transform] duration-100 ease-in",
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#ff9900]",
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
        disclaimer,
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
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
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(
        () => () => {
            if (timer.current) {
                clearTimeout(timer.current);
            }
        },
        [],
    );

    const fieldId = `${id || "anahata-newsletter"}-email`;
    const feedbackId = `${fieldId}-feedback`;

    const onSubmit = (e: FormEvent) => {
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

        // No backend is wired up on purpose: this block is a faithful
        // front-end of the "Stay in Touch" band, not a subscription service.
        // It still gives real feedback rather than silently doing nothing.
        setSubmission({ kind: "submitting" });
        timer.current = setTimeout(() => {
            setSubmission({
                kind: "subscribed",
                message: successMessage || DEFAULT_SUCCESS_MESSAGE,
            });
            setEmail("");
        }, FAKE_ROUNDTRIP_MS);
    };

    const onEmailChange = (value: string) => {
        setEmail(value);
        if (submission.kind === "invalid" || submission.kind === "subscribed") {
            setSubmission({ kind: "idle" });
        }
    };

    const isInvalid = submission.kind === "invalid";
    const isSubmitting = submission.kind === "submitting";
    const feedback =
        submission.kind === "invalid" || submission.kind === "subscribed"
            ? {
                  message: submission.message,
                  color:
                      submission.kind === "invalid"
                          ? FEEDBACK_ERROR
                          : FEEDBACK_SUCCESS,
              }
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
                            aria-invalid={isInvalid}
                            aria-describedby={feedback ? feedbackId : undefined}
                            onChange={(e) => onEmailChange(e.target.value)}
                            className="w-full min-w-0 flex-1 rounded-[4px] border px-[12px] py-[6px] text-left text-[1em] leading-[1.65] outline-none placeholder:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ff9900]"
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
                            style={{ fontFamily: FONT_BODY }}
                        >
                            {caption}
                        </button>
                    </form>
                )}

                <div role="status" aria-live="polite">
                    {feedback && (
                        <p
                            id={feedbackId}
                            className="mx-auto mb-0 mt-[20px] max-w-[520px] rounded-[4px] border p-[20px] text-center text-[18px]"
                            style={{
                                backgroundColor: CARD,
                                borderColor: BORDER_WARM,
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
