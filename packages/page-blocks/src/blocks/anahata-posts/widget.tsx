import React from "react";
import type { WidgetProps } from "@courselit/common-models";
import type { ThemeStyle } from "@courselit/page-models";
import { Section } from "@courselit/page-primitives";
import { Image, Link } from "@courselit/components-library";
import { isWaiting, resolveImageSrc } from "../../components/image-source";
import { PALETTE } from "../../components/palette";
import { WaitingForAsset } from "../../components/waiting-for-asset";
import Settings, { Post } from "./settings";
import { normalizePostThumbnail } from "./thumbnail";
import {
    heading as defaultHeading,
    headingLink as defaultHeadingLink,
    moreLink as defaultMoreLink,
    posts as defaultPosts,
    verticalPadding as defaultVerticalPadding,
} from "./defaults";

/**
 * "Writing and recipes" — Forest & Bone's 3-up cards on wide screens
 * (`02-forest-and-bone.html § 5`), Slate & Sage's ruled article rows on
 * phones (`04-slate-and-sage.html § 5`).
 *
 *  - ≥768px: card ground, 1px edge border, 6px radius, the 3:2 well on top,
 *    Playfair title in pine, date in ink-soft (`.card`, `.card__body`, `.meta`)
 *  - ≤767px: rows — 120px 3:2 thumb left, text right, a hairline edge
 *    between rows (`.rows`, `.row--post`)
 *  - the section carries the reference's top hairline (`.section--bordered`)
 *
 * Colours are v1.0 palette roles, delivered as `--ayr-posts-*` custom
 * properties so the class strings stay literal for Tailwind's scanner while
 * the values come from `PALETTE`. Only links react to hover; the well and the
 * card never do.
 */

const PALETTE_VARS = {
    "--ayr-posts-ground": PALETTE.bone,
    "--ayr-posts-card": PALETTE.card,
    "--ayr-posts-ink": PALETTE.ink,
    "--ayr-posts-ink-soft": PALETTE.inkSoft,
    "--ayr-posts-pine": PALETTE.pine,
    "--ayr-posts-pine-deep": PALETTE.pineDeep,
    "--ayr-posts-edge": PALETTE.edge,
} as React.CSSProperties;

/** The reference's `:focus-visible { outline: 3px solid pine; offset 3px }`. */
const FOCUS_RING =
    "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[var(--ayr-posts-pine)]";

/** Pine at rest, pine-deep on hover and on a keyboard-driven `:active`. */
const LINK_STATES =
    "text-[var(--ayr-posts-pine)] transition-colors duration-100 ease-in " +
    "hover:text-[var(--ayr-posts-pine-deep)] active:text-[var(--ayr-posts-pine-deep)] " +
    FOCUS_RING;

/** Card/row title: no underline at rest, a 2px one on hover/active (`.card__body h3 a`). */
const TITLE_LINK_CLASSES =
    "no-underline hover:underline active:underline decoration-2 underline-offset-[0.16em] " +
    LINK_STATES;

/** Body link: 1px underline at rest, 2px on hover/active (the reference's `a`). */
const TEXT_LINK_CLASSES =
    "underline decoration-1 hover:decoration-2 active:decoration-2 underline-offset-[0.16em] " +
    LINK_STATES;

function PostThumb({ post }: { post: Post }) {
    const { source, alt } = normalizePostThumbnail(post.thumbnail);
    const src = resolveImageSrc(source);

    // The 3:2 box is the one CSS box the picture will occupy; the well fills
    // it exactly, so layout is judged with the real geometry.
    return (
        <div className="relative w-full aspect-[3/2] overflow-hidden md:rounded-t-[6px]">
            {isWaiting(source) ? (
                <WaitingForAsset fill description={source.description} />
            ) : src ? (
                <Link
                    href={post.href}
                    className={`absolute inset-0 block ${FOCUS_RING}`}
                >
                    <Image
                        src={src}
                        alt={alt || post.title}
                        objectFit="cover"
                        width="w-full"
                        height="h-full"
                        sizes="(min-width: 768px) 33vw, 40vw"
                        noDefaultImage
                    />
                </Link>
            ) : null}
        </div>
    );
}

function PostCard({ post }: { post: Post }) {
    return (
        <li
            className={
                // ≤767px: a ruled row — thumb column, text column, hairline below.
                "grid grid-cols-[120px_minmax(0,1fr)] gap-4 items-start py-[22px] " +
                "border-b border-solid border-[var(--ayr-posts-edge)] " +
                // ≥768px: a card — ground, full 1px edge, radius, well on top.
                "md:block md:py-0 md:border md:rounded-[6px] md:overflow-hidden md:bg-[var(--ayr-posts-card)]"
            }
        >
            <PostThumb post={post} />
            <div className="min-w-0 md:px-5 md:pt-5 md:pb-6">
                <h3 className="m-0 font-playfair-display font-normal text-[20px] md:text-[22px] leading-[1.25]">
                    <Link href={post.href} className={TITLE_LINK_CLASSES}>
                        {post.title}
                    </Link>
                </h3>
                <p className="m-0 mt-[6px] text-[14px] leading-[1.5] text-[var(--ayr-posts-ink-soft)]">
                    {post.date}
                </p>
            </div>
        </li>
    );
}

export default function Widget({
    settings: {
        heading = defaultHeading,
        headingLink = defaultHeadingLink,
        posts = defaultPosts,
        moreLink,
        buttonCaption,
        buttonAction,
        cssId,
        verticalPadding,
        maxWidth,
        background,
    },
    state: { theme },
    nextTheme,
}: WidgetProps<Settings>) {
    const overiddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overiddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overiddenTheme.structure.section.padding.y =
        verticalPadding ||
        defaultVerticalPadding ||
        theme.theme.structure.section.padding.y;

    // `moreLink` wins; a pre-redesign layout's `buttonCaption`/`buttonAction`
    // pair still renders; otherwise the default.
    const link =
        moreLink ??
        (buttonCaption && buttonAction
            ? { label: buttonCaption, href: buttonAction }
            : defaultMoreLink);

    const headingClasses =
        "m-0 mb-10 font-playfair-display font-normal text-[28px] md:text-[36px] leading-[1.15] tracking-[-0.01em] text-[var(--ayr-posts-pine)]";

    return (
        <Section
            theme={overiddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme as "dark" | "light"}
            className="font-open-sans bg-[var(--ayr-posts-ground)] text-[var(--ayr-posts-ink)] border-t border-solid border-[var(--ayr-posts-edge)]"
            style={PALETTE_VARS}
        >
            <div className="flex flex-col">
                {heading &&
                    (headingLink ? (
                        <h2 className={headingClasses}>
                            <Link
                                href={headingLink}
                                className={`no-underline ${LINK_STATES}`}
                            >
                                {heading}
                            </Link>
                        </h2>
                    ) : (
                        <h2 className={headingClasses}>{heading}</h2>
                    ))}

                {posts.length > 0 && (
                    <ul className="list-none m-0 p-0 border-t border-solid border-[var(--ayr-posts-edge)] md:border-0 md:grid md:grid-cols-3 md:gap-6">
                        {posts.map((post) => (
                            <PostCard key={post.id} post={post} />
                        ))}
                    </ul>
                )}

                {link.label && link.href && (
                    <p className="m-0 mt-8 text-[16px] font-semibold">
                        <Link href={link.href} className={TEXT_LINK_CLASSES}>
                            {link.label}
                        </Link>
                    </p>
                )}
            </div>
        </Section>
    );
}
