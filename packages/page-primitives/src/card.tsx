import React from "react";
import { cn } from "./lib/utils";
import { Header4 } from "./header4";
import type { ThemeStyle } from "@courselit/page-models";

export interface PageCardProps extends React.HTMLAttributes<HTMLDivElement> {
    isLink?: boolean;
    children: React.ReactNode;
    className?: string;
    theme?: ThemeStyle;
}

export interface PageCardImageProps
    extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    className?: string;
    theme?: ThemeStyle;
}

export interface PageCardContentProps
    extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    theme?: ThemeStyle;
}

export interface PageCardHeaderProps
    extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    theme?: ThemeStyle;
}

export const PageCard: React.FC<PageCardProps> = ({
    isLink,
    children,
    className = "",
    theme,
    ...props
}) => {
    const cardStyles = theme?.interactives?.card;
    const classes = cn(
        // Base styles
        "bg-card text-card-foreground",
        // Theme interactivity
        cardStyles?.border?.width,
        cardStyles?.border?.radius,
        cardStyles?.border?.style,
        cardStyles?.shadow,
        // Hover/press feedback (and its transition) lives in the theme's
        // `card.custom` — e.g. classic: "transition-all duration-300
        // hover:shadow-lg hover:-translate-y-1". That reaction only makes
        // sense on a card that is actually a link: a static card must not
        // shift/shadow on hover (functional-vs-decorative rule), and the
        // transition is pointless without a state change. So gate the whole
        // custom slot, alongside cursor-pointer, on isLink. Link cards
        // (ProductCard, community/blog/discussion cards) keep their hover.
        isLink ? cn("cursor-pointer", cardStyles?.custom) : "",
        className,
    );

    return (
        <div className={classes} {...props}>
            {children}
        </div>
    );
};

export const PageCardImage: React.FC<PageCardImageProps> = ({
    src,
    alt,
    className = "",
    theme,
    ...props
}) => {
    // const cardStyles = theme?.interactives?.card;
    const classes = cn(
        // Base styles
        "w-full",
        className,
    );

    return <img src={src} alt={alt} className={classes} {...props} />;
};

export const PageCardContent: React.FC<PageCardContentProps> = ({
    children,
    className = "",
    theme,
    ...props
}) => {
    const cardStyles = theme?.interactives?.card;
    const classes = cn(
        // Base styles
        "p-4",
        // Theme interactivity
        cardStyles?.padding?.x,
        cardStyles?.padding?.y,
        className,
    );

    return (
        <div className={classes} {...props}>
            {children}
        </div>
    );
};

export const PageCardHeader: React.FC<PageCardHeaderProps> = ({
    children,
    className = "",
    theme,
    ...props
}) => {
    const classes = cn(
        // Base styles
        "pb-4",
        className,
    );

    return (
        <div className={classes} {...props}>
            <Header4 theme={theme}>{children}</Header4>
        </div>
    );
};
