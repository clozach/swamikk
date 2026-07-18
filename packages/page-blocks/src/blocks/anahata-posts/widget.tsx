import React from "react";
import type { WidgetProps } from "@courselit/common-models";
import type { ThemeStyle } from "@courselit/page-models";
import { Section } from "@courselit/page-primitives";
import { Image, Link } from "@courselit/components-library";
import Settings, { Post } from "./settings";
import {
    buttonAction as defaultButtonAction,
    buttonCaption as defaultButtonCaption,
    heading as defaultHeading,
    headingLink as defaultHeadingLink,
    posts as defaultPosts,
    showDivider as defaultShowDivider,
    thumbnailSize as defaultThumbnailSize,
    thumbnailSrc,
    verticalPadding as defaultVerticalPadding,
} from "./defaults";

/**
 * Anahata "Recent Posts".
 *
 * Fidelity notes, all traceable to the child theme (`25_all.css`):
 *  - ground `#f8ecdb`, section bottom padding 30px on the grid wrapper (:517, :521)
 *  - heading uppercase Playfair 32px/400 rust, centered by an inline style (:519)
 *  - divider 200px wide, 2px rust, centered, 55px below (:153)
 *  - cards are HORIZONTAL: `.vcex-blog-entry-inner { display: flex }` (:525)
 *  - title Playfair 16px/700 ink, margin-bottom 0 (:531); date 14px ink italic (:533)
 *  - `.match-height-content` 10px bottom padding + 1px dashed `#d7cdbf` (:529)
 *  - card border removed outright (:523)
 *  - 3-up >= 768px, 2-up 480-767px, 1-up <= 479px (span_1_of_3 / _pl / _pp)
 *
 * Card heights equalise per flex row via `flex-1` on the details column, which
 * replaces the theme's `.match-height-content` JavaScript.
 */

const CARD_TITLE_CLASSES =
    "block font-playfair-display text-[16px] font-bold leading-[1.4] text-[#545454] no-underline mb-0 " +
    "transition-colors duration-100 ease-in hover:text-[#993300] " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]";

const BUTTON_CLASSES =
    "inline-block cursor-pointer no-underline border-none text-center capitalize " +
    "bg-[#ff9900] text-white font-open-sans text-[14px] font-bold leading-[1.65] " +
    "min-w-[200px] px-[23px] py-[8px] rounded-[10px] " +
    // The source rule is `transition: 0.1s ease-in` — all properties, so the
    // active-state nudge eases alongside the colour change.
    "transition-all duration-100 ease-in hover:bg-[#993300] " +
    "active:bg-[#7a2900] active:translate-y-[1px] " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]";

function PostCard({ post }: { post: Post }) {
    const src = thumbnailSrc(post.thumbnail);
    const alt = post.thumbnail.alt || post.title;

    return (
        <div className="flex flex-col w-full min-[480px]:w-1/2 min-[768px]:w-1/3 px-[10px] mb-[20px]">
            <div className="flex flex-1 gap-[15px]">
                <Link
                    href={post.href}
                    className="shrink-0 block overflow-hidden w-[var(--anahata-thumb-sm)] h-[var(--anahata-thumb-sm)] min-[768px]:w-[var(--anahata-thumb)] min-[768px]:h-[var(--anahata-thumb)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]"
                >
                    <Image
                        src={src}
                        alt={alt}
                        objectFit="cover"
                        width="w-full"
                        height="h-full"
                        sizes="15vw"
                        noDefaultImage={!src}
                    />
                </Link>
                <div className="flex flex-1 flex-col min-w-0">
                    <div className="flex-1 pb-[10px] border-b border-dashed border-[#d7cdbf]">
                        <Link href={post.href} className={CARD_TITLE_CLASSES}>
                            {post.title}
                        </Link>
                        <div className="text-[14px] italic leading-[1.65] text-[#545454]">
                            {post.date}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Widget({
    settings: {
        heading = defaultHeading,
        headingLink = defaultHeadingLink,
        showDivider = defaultShowDivider,
        posts = defaultPosts,
        thumbnailSize = defaultThumbnailSize,
        buttonCaption = defaultButtonCaption,
        buttonAction = defaultButtonAction,
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

    // Below 768px the columns go 2-up; a full-size thumbnail would leave almost
    // no room for the title there, so the thumbnail shrinks with the layout.
    const thumbStyle = {
        "--anahata-thumb": `${thumbnailSize}px`,
        "--anahata-thumb-sm": `${Math.min(thumbnailSize, 100)}px`,
    } as React.CSSProperties;

    const headingClasses =
        "font-playfair-display text-[32px] font-normal leading-[1.2] uppercase text-[#993300] text-center pb-[15px] m-0";

    return (
        <Section
            theme={overiddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme as "dark" | "light"}
            className="bg-[#f8ecdb] text-[#545454] font-open-sans"
        >
            <div className="flex flex-col" style={thumbStyle}>
                {heading &&
                    (headingLink ? (
                        <h2 className={headingClasses}>
                            <Link
                                href={headingLink}
                                className="text-inherit no-underline transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]"
                            >
                                {heading}
                            </Link>
                        </h2>
                    ) : (
                        <h2 className={headingClasses}>{heading}</h2>
                    ))}

                {showDivider && (
                    <hr
                        aria-hidden="true"
                        className="w-[80%] max-w-[200px] h-0 mx-auto mb-[55px] border-0 border-b-2 border-solid border-[#993300]"
                    />
                )}

                {posts.length > 0 && (
                    <div className="pb-[30px]">
                        <div className="flex flex-wrap -mx-[10px]">
                            {posts.map((post) => (
                                <PostCard key={post.id} post={post} />
                            ))}
                        </div>
                    </div>
                )}

                {buttonCaption && buttonAction && (
                    <div className="text-center">
                        <Link href={buttonAction} className={BUTTON_CLASSES}>
                            {buttonCaption}
                        </Link>
                    </div>
                )}
            </div>
        </Section>
    );
}
