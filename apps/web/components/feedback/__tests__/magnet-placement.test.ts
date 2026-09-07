import { placeMagnet } from "../magnet-placement";

const intersects = (a, b) =>
    a.left < b.right &&
    a.left + a.width > b.left &&
    a.top < b.bottom &&
    a.top + a.height > b.top;

const viewports = [
    { left: 0, top: 0, width: 390, height: 700 },
    { left: 0, top: 240, width: 390, height: 260 }, // keyboard pans visible area
    { left: 165, top: 210, width: 195, height: 350 }, // pinch zoom and pan
    { left: 0, top: 0, width: 720, height: 440 }, // desktop 200% available space
];

test.each(viewports)(
    "every edge and offscreen target keeps the entire toolbar in the visible viewport %j",
    (viewport) => {
        for (const left of [
            -900,
            viewport.left,
            viewport.left + viewport.width - 10,
            1900,
        ]) {
            for (const top of [
                -1000,
                viewport.top,
                viewport.top + viewport.height - 8,
                2200,
            ]) {
                const result = placeMagnet(
                    { left, top, right: left + 150, bottom: top + 50 },
                    viewport,
                    { width: 252, height: 60 },
                );
                const width = Math.min(252, result.maxWidth);
                const height = Math.min(60, result.maxHeight);
                expect(result.left).toBeGreaterThanOrEqual(viewport.left);
                expect(result.top).toBeGreaterThanOrEqual(viewport.top);
                expect(result.left + width).toBeLessThanOrEqual(
                    viewport.left + viewport.width,
                );
                expect(result.top + height).toBeLessThanOrEqual(
                    viewport.top + viewport.height,
                );
            }
        }
    },
);

test("prefers a clear target edge rather than obscuring content when an adjacent position fits", () => {
    const viewport = { left: 0, top: 0, width: 390, height: 400 };
    const target = { left: 70, right: 330, top: 330, bottom: 390 };
    const result = placeMagnet(target, viewport, { width: 204, height: 60 });
    expect(intersects({ ...result, width: 204, height: 60 }, target)).toBe(
        false,
    );
    expect(result.top + 60).toBeLessThanOrEqual(target.top);
});

test("a large target still yields reachable controls; an absent target reserves the question button corner", () => {
    const viewport = { left: 45, top: 200, width: 240, height: 150 };
    const target = { left: -100, right: 1500, top: -500, bottom: 2000 };
    const result = placeMagnet(target, viewport, { width: 280, height: 220 });
    expect(result.maxHeight).toBeLessThan(viewport.height);
    expect(result.maxWidth).toBeLessThan(viewport.width);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(350);
    const unselected = placeMagnet(null, viewport, { width: 100, height: 52 });
    expect(unselected.top + 52).toBeLessThanOrEqual(350 - 60);
});

describe.each([106, 250])("%ipx public/admin tools", (width) => {
    test.each([
        {
            viewport: { left: 0, top: 0, width: 260, height: 466.666687 },
            help: { left: 200, top: 406.65625, right: 244, bottom: 450.65625 },
        },
        {
            viewport: { left: 0, top: 0, width: 390, height: 260 },
            help: { left: 330, top: 200, right: 374, bottom: 244 },
        },
        {
            // The mobile purchase bar raises the actual help button by 96px.
            viewport: { left: 40, top: 120, width: 260, height: 300 },
            help: { left: 240, top: 264, right: 284, bottom: 308 },
        },
    ])(
        "keep the help control usable for clamped and unselected tools %j",
        ({ viewport, help }) => {
            for (const target of [
                { left: 0, top: 566, right: 390, bottom: 1460.203 },
                { left: -100, top: -1000, right: 1500, bottom: -500 },
                { left: 0, top: 0, right: 1500, bottom: 2000 },
                null,
            ]) {
                const result = placeMagnet(
                    target,
                    viewport,
                    { width, height: 58 },
                    help,
                );
                const rect = {
                    ...result,
                    width: Math.min(width, result.maxWidth),
                    height: 58,
                };
                expect(
                    intersects(rect, {
                        left: help.left - 8,
                        top: help.top - 8,
                        right: help.right + 8,
                        bottom: help.bottom + 8,
                    }),
                ).toBe(false);
                expect(rect.left).toBeGreaterThanOrEqual(viewport.left);
                expect(rect.top).toBeGreaterThanOrEqual(viewport.top);
                expect(rect.left + rect.width).toBeLessThanOrEqual(
                    viewport.left + viewport.width,
                );
                expect(rect.top + rect.height).toBeLessThanOrEqual(
                    viewport.top + viewport.height,
                );
            }
        },
    );
});

test("reserves only the help rectangle, leaving an adjacent bottom target edge available", () => {
    const target = { left: 10, top: 300, right: 110, bottom: 340 };
    const help = { left: 330, top: 340, right: 374, bottom: 384 };
    const result = placeMagnet(
        target,
        { left: 0, top: 0, width: 390, height: 400 },
        { width: 106, height: 44 },
        help,
    );
    expect(result.top).toBe(348);
    expect(intersects({ ...result, width: 106, height: 44 }, help)).toBe(false);
    expect(intersects({ ...result, width: 106, height: 44 }, target)).toBe(
        false,
    );
});
