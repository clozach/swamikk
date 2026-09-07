import * as React from "react";

/** Site navigation uses relative URLs; qualified HTTP(S) destinations leave it.
 * Explicit same-tab transitions and file/mail/phone actions keep native behavior.
 */
export function externalLinkProps(
    href: string,
    {
        openInSameTab,
        download,
    }: {
        openInSameTab?: boolean;
        download?: boolean | string;
    } = {},
): { target?: "_blank"; rel?: "noopener noreferrer" } {
    if (download !== undefined && download !== false) return {};
    if (/^(?:mailto:|tel:|#)/i.test(href)) return {};
    const qualifiedHttp = /^(?:https?:)?\/\//i.test(href);
    const newTab =
        openInSameTab === false ||
        (openInSameTab === undefined && qualifiedHttp);
    return newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

export function ExternalLinkLabel({
    children,
    newTab = false,
}: {
    children: React.ReactNode;
    newTab?: boolean;
}) {
    const text =
        typeof children === "string"
            ? children.replace(/\s*↗\s*$/, "")
            : children;
    return (
        <>
            {text}
            {newTab && (
                <>
                    {typeof children === "string" && (
                        <sup
                            aria-hidden="true"
                            className="ml-[0.18em] inline-block align-super text-[0.65em] leading-none"
                        >
                            ↗
                        </sup>
                    )}
                    <span className="sr-only"> (opens in a new tab)</span>
                </>
            )}
        </>
    );
}
