import {
    externalLinkProps,
    ExternalLinkLabel,
} from "@courselit/components-library";
import React from "react";
import clsx from "clsx";
import { TopBarItem } from "../settings";
import {
    DARK_SURFACE_VARS,
    DRAWER,
    TOP_BAR_CONTAINER,
    TOP_BAR_LINK,
} from "./tokens";

/* ------------------------------------------------------------------ *
 * Pine-dark utility strip. Sets DARK_SURFACE_VARS so its links paint from
 * the same --nav-* variables as the drawer (bone / moss-light).
 * ------------------------------------------------------------------ */
export default function TopBar({
    left,
    right,
}: {
    left: TopBarItem[];
    right: TopBarItem[];
}) {
    return (
        // The whole strip drops out below 560px, as on the live site.
        <div
            className="max-[559px]:hidden"
            style={
                {
                    backgroundColor: DRAWER,
                    color: "var(--nav-fg)",
                    ...DARK_SURFACE_VARS,
                } as React.CSSProperties
            }
        >
            <div
                className={clsx(
                    TOP_BAR_CONTAINER,
                    "flex items-center justify-between py-[6px]",
                )}
            >
                <ul className="m-0 flex list-none flex-wrap items-center gap-x-5 gap-y-1 p-0">
                    {left.map((item) => (
                        <li key={item.id} className="m-0 list-none p-0">
                            <a
                                href={item.href || "#"}
                                {...externalLinkProps(item.href || "#")}
                                className={TOP_BAR_LINK}
                            >
                                <ExternalLinkLabel
                                    newTab={
                                        externalLinkProps(item.href || "#")
                                            .target === "_blank"
                                    }
                                >
                                    {item.label}
                                </ExternalLinkLabel>
                            </a>
                        </li>
                    ))}
                </ul>
                {/* The right group drops out at the mobile breakpoint.
                    Two mutually-exclusive media-scoped rules rather than a base
                    "hidden" overridden by "md:flex". The override wins today,
                    but only because apps/web's own Tailwind output — the last
                    of four stylesheets — happens to emit `.md\:flex` as well;
                    components-library emits an unconditional `.hidden` that
                    would otherwise take it. The utility bar's own
                    `min-[560px]:block` had no such rescuer and never rendered
                    at all. Scoping both rules to their own range removes the
                    dependency. */}
                <ul className="m-0 max-[767px]:hidden list-none items-center gap-x-5 p-0 pt-[5px] md:flex">
                    {right.map((item) => (
                        <li key={item.id} className="m-0 list-none p-0">
                            <a
                                href={item.href || "#"}
                                {...externalLinkProps(item.href || "#")}
                                className={TOP_BAR_LINK}
                            >
                                <ExternalLinkLabel
                                    newTab={
                                        externalLinkProps(item.href || "#")
                                            .target === "_blank"
                                    }
                                >
                                    {item.label}
                                </ExternalLinkLabel>
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
