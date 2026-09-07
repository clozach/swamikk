/** Document-space endpoints; measurement is separate from the scroll paint. */
export interface ImageBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface ImageJourney {
    cover: ImageBox;
    destination: ImageBox;
    startScroll: number;
    endScroll: number;
}

export interface ImagePose {
    progress: number;
    scale: number;
    x: number;
    y: number;
    insetX: number;
    insetY: number;
}

export function imageJourney(
    cover: ImageBox,
    destination: ImageBox,
    viewportHeight: number,
): ImageJourney | null {
    if (
        [
            cover.width,
            cover.height,
            destination.width,
            destination.height,
            viewportHeight,
        ].some((value) => !Number.isFinite(value) || value <= 0)
    )
        return null;
    const startScroll = Math.max(
        0,
        cover.top - Math.max(0, viewportHeight - cover.height),
    );
    const endScroll = Math.max(
        startScroll + 1,
        destination.top -
            Math.max(24, (viewportHeight - destination.height) / 2),
    );
    return { cover, destination, startScroll, endScroll };
}

/** A uniform scale plus clipping changes the frame without stretching the photo. */
export function imagePose(journey: ImageJourney, scrollY: number): ImagePose {
    const { cover, destination, startScroll, endScroll } = journey;
    const raw = Math.max(
        0,
        Math.min(1, (scrollY - startScroll) / (endScroll - startScroll)),
    );
    const progress = raw * raw * (3 - 2 * raw);
    const finalScale = Math.max(
        destination.width / cover.width,
        destination.height / cover.height,
    );
    return {
        progress,
        scale: 1 + (finalScale - 1) * progress,
        x:
            (destination.left +
                destination.width / 2 -
                cover.left -
                cover.width / 2) *
            progress,
        y:
            (destination.top +
                destination.height / 2 -
                cover.top -
                cover.height / 2) *
            progress,
        insetX:
            Math.max(0, (cover.width - destination.width / finalScale) / 2) *
            progress,
        insetY:
            Math.max(0, (cover.height - destination.height / finalScale) / 2) *
            progress,
    };
}
