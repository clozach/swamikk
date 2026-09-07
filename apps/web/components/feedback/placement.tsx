"use client";

import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePortalHost, useVisualViewport } from "./viewport";

/** Compatibility seams for existing shells; the control now belongs to the viewport. */
export function FeedbackPlacementProvider({
    children,
}: {
    children: ReactNode;
}) {
    return <>{children}</>;
}

export function FeedbackControlSlot() {
    return null;
}

export function FeedbackControlPlacement({
    children,
}: {
    children: ReactNode;
}) {
    const host = usePortalHost();
    const viewport = useVisualViewport();
    if (!host) return null;
    return createPortal(
        <div
            data-feedback-ui
            className="kk-feedback-corner"
            style={
                viewport
                    ? {
                          left: viewport.left,
                          top: viewport.top,
                          width: viewport.width,
                          height: viewport.height,
                      }
                    : undefined
            }
        >
            {children}
        </div>,
        host,
    );
}

/** Keep highlight geometry outside transformed/overflow-clipped page ancestors too. */
export function FeedbackOutline({
    rect,
}: {
    rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
}) {
    const host = usePortalHost();
    return host
        ? createPortal(
              <div
                  aria-hidden="true"
                  className="kk-feedback-outline"
                  style={{
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                  }}
              />,
              host,
          )
        : null;
}
