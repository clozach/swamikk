import * as React from "react";
import NextLink from "next/link";
import { externalLinkProps, ExternalLinkLabel } from "./external-link";

interface LinkProps {
    href: string;
    children?: React.ReactNode;
    openInSameTab?: boolean;
    style?: Record<string, string>;
    className?: string;
    onClick?: () => void;
    download?: boolean | string;
}

export default function Link({
    href,
    children,
    openInSameTab,
    style,
    className = "",
    onClick,
    download,
}: LinkProps) {
    const isInternal =
        href &&
        href.startsWith("/") &&
        !href.startsWith("//") &&
        !href.startsWith("/dashboard");
    const isInPageNavigation = href && href.startsWith("#");
    const destination = externalLinkProps(href, { openInSameTab, download });

    if (isInPageNavigation) {
        return (
            <a
                href={href}
                style={{ ...style }}
                className={className}
                onClick={onClick}
            >
                {children}
            </a>
        );
    }

    const label = (
        <ExternalLinkLabel newTab={destination.target === "_blank"}>
            {children}
        </ExternalLinkLabel>
    );
    return isInternal && !destination.target && download === undefined ? (
        <NextLink
            href={href}
            style={{ ...style }}
            onClick={onClick}
            className={className}
        >
            {label}
        </NextLink>
    ) : (
        <a
            href={href}
            style={{ ...style }}
            className={className}
            {...destination}
            download={download}
            onClick={onClick}
        >
            {label}
        </a>
    );
}
