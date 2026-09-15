import NextImage from "next/image";
import type { CSSProperties } from "react";

export interface ResponsiveImageProps {
    src: string;
    alt: string;
    /** Actual rendered width, including responsive breakpoints. */
    sizes: string;
    className?: string;
    style?: CSSProperties;
    objectFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
    objectPosition?: string;
    priority?: boolean;
}

/** Public images only. Parent supplies a positioned box with its own geometry. */
export function ResponsiveImage({
    src,
    alt,
    sizes,
    className,
    style,
    objectFit = "cover",
    objectPosition = "center",
    priority = false,
}: ResponsiveImageProps) {
    return (
        <NextImage
            src={src}
            alt={alt}
            fill
            sizes={sizes}
            quality={75}
            priority={priority}
            className={className}
            style={{ ...style, objectFit, objectPosition }}
        />
    );
}
