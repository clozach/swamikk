import type { ViewportBounds } from "./viewport";

export interface TargetBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));

/** Keep controls visible and the help button usable, then minimize target coverage. */
export function placeMagnet(
    target: TargetBounds | null,
    viewport: ViewportBounds,
    measured: { width: number; height: number },
    help: TargetBounds | null = null,
) {
    const gap = 8;
    const inset = Math.min(gap, viewport.width / 4, viewport.height / 4);
    const minX = viewport.left + inset;
    const minY = viewport.top + inset;
    const maxWidth = Math.max(0, viewport.width - inset * 2);
    const maxHeight = Math.max(0, viewport.height - inset * 2);
    const width = Math.min(measured.width, maxWidth);
    const height = Math.min(measured.height, maxHeight);
    const maxX = minX + maxWidth - width;
    const maxY = minY + maxHeight - height;
    const bound = ({ left, top }: { left: number; top: number }) => ({
        left: clamp(left, minX, maxX),
        top: clamp(top, minY, maxY),
    });
    const fallback = bound({ left: maxX, top: maxY - 60 });
    const centerX = clamp(
        target ? (target.left + target.right) / 2 : maxX,
        minX,
        minX + maxWidth,
    );
    const centerY = clamp(
        target ? (target.top + target.bottom) / 2 : maxY,
        minY,
        minY + maxHeight,
    );
    const preferred = target
        ? [
              { left: centerX - width / 2, top: target.bottom + gap },
              { left: centerX - width / 2, top: target.top - height - gap },
              { left: target.right + gap, top: centerY - height / 2 },
              { left: target.left - width - gap, top: centerY - height / 2 },
          ]
        : [fallback];
    const candidates = preferred.map(bound);
    if (help) {
        // Reserve this control only; other parts of the bottom edge remain usable.
        for (const candidate of preferred) {
            candidates.push(
                bound({ left: help.left - width - gap, top: candidate.top }),
                bound({ left: help.right + gap, top: candidate.top }),
                bound({ left: candidate.left, top: help.top - height - gap }),
                bound({ left: candidate.left, top: help.bottom + gap }),
            );
        }
    }
    const overlap = (
        position: { left: number; top: number },
        rect: TargetBounds | null,
    ) =>
        rect
            ? Math.max(
                  0,
                  Math.min(position.left + width, rect.right) -
                      Math.max(position.left, rect.left),
              ) *
              Math.max(
                  0,
                  Math.min(position.top + height, rect.bottom) -
                      Math.max(position.top, rect.top),
              )
            : 0;
    const distance = (position: { left: number; top: number }) =>
        target
            ? Math.max(
                  target.left - position.left - width,
                  position.left - target.right,
                  0,
              ) +
              Math.max(
                  target.top - position.top - height,
                  position.top - target.bottom,
                  0,
              )
            : Math.abs(position.left - fallback.left) +
              Math.abs(position.top - fallback.top);
    const reserved = help
        ? {
              left: help.left - gap,
              right: help.right + gap,
              top: help.top - gap,
              bottom: help.bottom + gap,
          }
        : null;
    candidates.sort(
        (a, b) =>
            overlap(a, reserved) - overlap(b, reserved) ||
            overlap(a, target) - overlap(b, target) ||
            distance(a) - distance(b),
    );
    return { ...candidates[0], maxWidth, maxHeight };
}
