import React from "react";
import clsx from "clsx";
import { TopBarItem } from "../settings";
import { COCOA, TOP_BAR_CONTAINER, TOP_BAR_LINK } from "./tokens";

/* ------------------------------------------------------------------ *
 * Cocoa utility strip
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
            style={{ backgroundColor: COCOA, color: "#ffffff" }}
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
                            <a href={item.href || "#"} className={TOP_BAR_LINK}>
                                {item.label}
                            </a>
                        </li>
                    ))}
                </ul>
                {/* The right group drops out at the mobile breakpoint. */}
                <ul className="m-0 hidden list-none items-center gap-x-5 p-0 pt-[5px] md:flex">
                    {right.map((item) => (
                        <li key={item.id} className="m-0 list-none p-0">
                            <a href={item.href || "#"} className={TOP_BAR_LINK}>
                                {item.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
