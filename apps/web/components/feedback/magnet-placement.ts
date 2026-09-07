import type { ViewportBounds } from "./viewport";

export interface TargetBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));

/** Visibility wins; among fully visible placements, cover as little of the target as possible. */
export function placeMagnet(
    target: TargetBounds | null,
    viewport: ViewportBounds,
    measured: { width: number; height: number },
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
    if (!target) {
        return {
            ...bound({ left: maxX, top: maxY - 60 }),
            maxWidth,
            maxHeight,
        };
    }
    const centerX = clamp(
        (target.left + target.right) / 2,
        minX,
        minX + maxWidth,
    );
    const centerY = clamp(
        (target.top + target.bottom) / 2,
        minY,
        minY + maxHeight,
    );
    const candidates = [
        { left: centerX - width / 2, top: target.bottom + gap },
        { left: centerX - width / 2, top: target.top - height - gap },
        { left: target.right + gap, top: centerY - height / 2 },
        { left: target.left - width - gap, top: centerY - height / 2 },
    ].map(bound);
    const overlap = (position: { left: number; top: number }) =>
        Math.max(
            0,
            Math.min(position.left + width, target.right) -
                Math.max(position.left, target.left),
        ) *
        Math.max(
            0,
            Math.min(position.top + height, target.bottom) -
                Math.max(position.top, target.top),
        );
    const distance = (position: { left: number; top: number }) =>
        Math.max(
            target.left - position.left - width,
            position.left - target.right,
            0,
        ) +
        Math.max(
            target.top - position.top - height,
            position.top - target.bottom,
            0,
        );
    candidates.sort(
        (a, b) => overlap(a) - overlap(b) || distance(a) - distance(b),
    );
    return { ...candidates[0], maxWidth, maxHeight };
}
