import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MediaPlayer } from "../../../../../packages/components-library/src/media-player";
import type { MediaPlayerLabels } from "@courselit/common-models";

const labels: MediaPlayerLabels = {
    audioTitle: "Audio practice",
    play: "Play",
    pause: "Pause",
    back: "Back 15 seconds",
    forward: "Forward 15 seconds",
    mute: "Mute",
    unmute: "Unmute",
    seek: "Playback position",
    speed: "Speed",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit fullscreen",
    fullscreenUnavailable:
        "Use Fullscreen to try again. Inline playback continues.",
    inlineOnly: "Playback stays inline while mimicking a member.",
    playbackError: "Playback failed. Please try Play again.",
    captions: "Captions",
    captionsOff: "Off",
    transcript: "Read transcript",
};

let fullscreen: Element | null;
let orientation: EventTarget & { type: string };
let paused: WeakMap<HTMLMediaElement, boolean>;
let requestFullscreen: jest.Mock;
let exitFullscreen: jest.Mock;

beforeEach(() => {
    fullscreen = null;
    paused = new WeakMap();
    orientation = Object.assign(new EventTarget(), {
        type: "portrait-primary",
    });
    Object.defineProperty(window.screen, "orientation", {
        configurable: true,
        value: orientation,
    });
    Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => fullscreen,
    });
    Object.defineProperty(document, "fullscreenEnabled", {
        configurable: true,
        value: true,
    });
    requestFullscreen = jest.fn(async function (this: HTMLElement) {
        fullscreen = this;
        document.dispatchEvent(new Event("fullscreenchange"));
    });
    exitFullscreen = jest.fn(async () => {
        fullscreen = null;
        document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
        configurable: true,
        value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
        configurable: true,
        value: exitFullscreen,
    });
    jest.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(
        function () {
            return paused.get(this) ?? true;
        },
    );
    jest.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(
        120,
    );
    jest.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
        async function () {
            paused.set(this, false);
            this.dispatchEvent(new Event("play"));
        },
    );
    jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
        function () {
            paused.set(this, true);
            this.dispatchEvent(new Event("pause"));
        },
    );
    jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

async function rotate(type: string) {
    await act(async () => {
        orientation.type = type;
        orientation.dispatchEvent(new Event("change"));
    });
}

function video(presentation: "responsive" | "inline-only" = "responsive") {
    return render(
        <MediaPlayer
            kind="video"
            src="/lesson.mp4"
            title="Practice"
            labels={labels}
            presentation={presentation}
        />,
    );
}

it("starts inline without autoplay and ignores rotation while paused", async () => {
    const { container } = video();
    expect(container.querySelector("video")).toHaveAttribute("playsinline");
    expect(container.querySelector("video")).not.toHaveAttribute("autoplay");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await rotate("landscape-primary");
    expect(requestFullscreen).not.toHaveBeenCalled();
});

it("rotates an already playing video into fullscreen and back without replacing or restarting it", async () => {
    const { container } = video();
    const media = container.querySelector("video")!;
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    media.currentTime = 53;
    await rotate("landscape-primary");
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(fullscreen).toContainElement(media);
    await rotate("portrait-primary");
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(container.querySelector("video")).toBe(media);
    expect(media.currentTime).toBe(53);
    expect(media.paused).toBe(false);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
});

it("leaves playback inline after rejection and offers the manual fullscreen retry", async () => {
    requestFullscreen.mockRejectedValueOnce(
        new Error("User activation required"),
    );
    video();
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    await rotate("landscape-primary");
    expect(screen.getByRole("status")).toHaveTextContent(
        labels.fullscreenUnavailable,
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeVisible();
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Fullscreen" })),
    );
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("does not immediately re-enter after a manual fullscreen exit", async () => {
    video();
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    await rotate("landscape-primary");
    await act(async () =>
        fireEvent.click(
            screen.getByRole("button", { name: "Exit fullscreen" }),
        ),
    );
    await rotate("landscape-primary");
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
});

it("exits a delayed automatic request when the phone has already returned to portrait", async () => {
    let finish: () => void = () => {};
    requestFullscreen.mockImplementation(function (this: HTMLElement) {
        const wrapper = this;
        return new Promise<void>((resolve) => {
            finish = () => {
                fullscreen = wrapper;
                document.dispatchEvent(new Event("fullscreenchange"));
                resolve();
            };
        });
    });
    video();
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    await rotate("landscape-primary");
    await rotate("portrait-primary");
    await act(async () => finish());
    expect(fullscreen).toBeNull();
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
});

it("keeps Mimic inline with ordinary controls so its identity is not hidden", async () => {
    video("inline-only");
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    await rotate("landscape-primary");
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(
        screen.queryByRole("button", { name: "Fullscreen" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(labels.inlineOnly)).toBeVisible();
    expect(screen.getByRole("slider", { name: labels.seek })).toBeEnabled();
});

it("uses native iPhone fullscreen only from the manual button", async () => {
    Object.defineProperty(document, "fullscreenEnabled", {
        configurable: true,
        value: false,
    });
    const { container } = video();
    const nativeEnter = jest.fn();
    Object.assign(container.querySelector("video")!, {
        webkitEnterFullscreen: nativeEnter,
    });
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    await rotate("landscape-primary");
    expect(nativeEnter).not.toHaveBeenCalled();
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Fullscreen" })),
    );
    expect(nativeEnter).toHaveBeenCalledTimes(1);
});

it("plays one preview at a time and releases the media on unmount", async () => {
    const { container, unmount } = render(
        <>
            <MediaPlayer
                kind="audio"
                compact
                src="/one.mp3"
                title="First preview"
                labels={labels}
            />
            <MediaPlayer
                kind="audio"
                compact
                src="/two.mp3"
                title="Second preview"
                labels={labels}
            />
        </>,
    );
    const [first, second] = Array.from(container.querySelectorAll("audio"));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await act(async () =>
        fireEvent.click(
            within(
                screen.getByRole("group", { name: "First preview" }),
            ).getByRole("button", { name: "Play" }),
        ),
    );
    await act(async () =>
        fireEvent.click(
            within(
                screen.getByRole("group", { name: "Second preview" }),
            ).getByRole("button", { name: "Play" }),
        ),
    );
    expect(first.paused).toBe(true);
    expect(second.paused).toBe(false);
    unmount();
    expect(second.paused).toBe(true);
    expect(second).not.toHaveAttribute("src");
});

it("keeps a rejected Play action recoverable and bounds seeking", async () => {
    jest.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
        new Error("Network"),
    );
    const { container } = video();
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(labels.playbackError);
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: labels.back }));
    expect(container.querySelector("video")!.currentTime).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: labels.forward }));
    expect(container.querySelector("video")!.currentTime).toBe(15);
});

function foregroundDialog(role: "dialog" | "alertdialog" = "dialog") {
    const view = render(
        <div role={role} aria-label="Foreground task" aria-modal="true">
            <textarea
                aria-label="Unsent comment"
                defaultValue="Keep my draft"
            />
        </div>,
    );
    const dialog = screen.getByRole(role, { name: "Foreground task" });
    jest.spyOn(dialog, "getClientRects").mockReturnValue([
        dialog.getBoundingClientRect(),
    ] as unknown as DOMRectList);
    return { ...view, dialog };
}

it.each(["dialog", "alertdialog"] as const)(
    "keeps a visible foreground %s and its draft in view during rotation",
    async (role) => {
        const { container } = video();
        const media = container.querySelector("video")!;
        await act(async () =>
            fireEvent.click(screen.getByRole("button", { name: "Play" })),
        );
        media.currentTime = 53;
        media.playbackRate = 1.25;
        const foreground = foregroundDialog(role);
        const draft = screen.getByRole("textbox", { name: "Unsent comment" });
        draft.focus();
        await rotate("landscape-primary");
        expect(requestFullscreen).not.toHaveBeenCalled();
        expect(draft).toHaveFocus();
        expect(draft).toHaveValue("Keep my draft");
        expect(media.paused).toBe(false);
        expect(media.currentTime).toBe(53);
        expect(media.playbackRate).toBe(1.25);
        foreground.unmount();
        expect(requestFullscreen).not.toHaveBeenCalled();
        await act(async () =>
            fireEvent.click(screen.getByRole("button", { name: "Fullscreen" })),
        );
        expect(requestFullscreen).toHaveBeenCalledTimes(1);
    },
);

it("does not let hidden dialog markup block an ordinary orientation request", async () => {
    video();
    const { dialog } = foregroundDialog();
    dialog.hidden = true;
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    await rotate("landscape-primary");
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
});

it("returns from a delayed automatic request if a foreground dialog opened meanwhile", async () => {
    let finish: () => void = () => {};
    requestFullscreen.mockImplementation(function (this: HTMLElement) {
        const wrapper = this;
        return new Promise<void>((resolve) => {
            finish = () => {
                fullscreen = wrapper;
                document.dispatchEvent(new Event("fullscreenchange"));
                resolve();
            };
        });
    });
    video();
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Play" })),
    );
    await rotate("landscape-primary");
    foregroundDialog();
    await act(async () => finish());
    expect(fullscreen).toBeNull();
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox")).toHaveValue("Keep my draft");
});
