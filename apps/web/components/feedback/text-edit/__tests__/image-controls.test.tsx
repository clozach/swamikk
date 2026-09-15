import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    act,
    createEvent,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { ImageEditControls } from "../image-controls";
import { indexLeaves } from "../leaves";
import type { ImageSource, PageTextLeaves } from "@courselit/common-models";

const mockUpload = jest.fn();
jest.mock("@courselit/components-library/images", () => ({
    imageFileError: jest.requireActual(
        "../../../../../../packages/components-library/src/image-input",
    ).imageFileError,
    ImageFileInput: () => <div>Image picker</div>,
    maybeDownsizeImage: async (file) => ({ file }),
    useMediaLit: () => ({
        uploadFile: mockUpload,
        uploadProgress: 0,
        isUploading: false,
        cancelUpload: jest.fn(),
    }),
}));
jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }) =>
        open ? <div role="dialog">{children}</div> : null,
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
    DialogDescription: ({ children }) => <p>{children}</p>,
}));

const placeholder: ImageSource = {
    kind: "placeholder",
    description: "Site mark",
};
const media = { mediaId: "uploaded", file: "https://media.test/uploaded.png" };
const file = () => new File(["image"], "photo.png", { type: "image/png" });
const leaves = (value: ImageSource = placeholder): PageTextLeaves => ({
    pageId: "home",
    revision: 1,
    widgets: [
        {
            widgetId: "header",
            name: "anahataHeader",
            shared: true,
            leaves: [],
            images: [{ path: "logoSource", value, label: "Site mark" }],
        },
        {
            widgetId: "post",
            name: "anahataPosts",
            shared: false,
            leaves: [],
            images: [
                {
                    path: "posts.0.thumbnail",
                    value: placeholder,
                    label: "Post photograph",
                },
            ],
        },
    ],
});
const mark = () =>
    document.querySelector<HTMLElement>(
        '[data-kk-image-path="logoSource"] [data-asset]',
    )!;
const post = () =>
    document.querySelector<HTMLElement>(
        '[data-kk-image-path="posts.0.thumbnail"]',
    )!;
const drop = (target: Element, files: File[]) =>
    fireEvent.drop(target, { dataTransfer: { files, types: ["Files"] } });
const onSave = jest.fn();
const onBusy = jest.fn();
let rect: jest.SpyInstance;
beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML =
        '<div data-feedback-page="home"><header data-feedback-id="header"><a href="/"><span data-kk-image-path="logoSource"><span data-asset="waiting"><svg><rect /></svg></span></span><span data-testid="brand">Swami</span></a></header><section data-feedback-id="post"><a href="/blog/post"><div data-kk-image-path="posts.0.thumbnail"><div data-asset="waiting">Post image</div></div></a></section></div>';
    rect = jest
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue({
            width: 40,
            height: 40,
            left: 24,
            top: 45,
            bottom: 85,
        } as DOMRect);
    mockUpload.mockResolvedValue(media);
    onSave.mockResolvedValue(undefined);
});
afterEach(() => rect.mockRestore());
async function mount(disabled = false, value = placeholder) {
    const ui = render(
        <ImageEditControls
            pageId="home"
            index={indexLeaves(leaves(value))}
            disabled={disabled}
            onSave={onSave}
            onBusy={onBusy}
        />,
    );
    await screen.findByRole("button", {
        name:
            value.kind === "placeholder"
                ? "Add Site mark"
                : "Replace Site mark",
    });
    return ui;
}

it("opens the picker from the logo glyph without following Home; brand navigation stays available", async () => {
    await mount();
    const click = createEvent.click(mark().querySelector("rect")!);
    fireEvent(mark().querySelector("rect")!, click);
    expect(click.defaultPrevented).toBe(true);
    expect(screen.getByRole("dialog")).toHaveTextContent("Image picker");
    const brand = createEvent.click(screen.getByTestId("brand"));
    fireEvent(screen.getByTestId("brand"), brand);
    expect(brand.defaultPrevented).toBe(false);
});

it.each(["logo", "post", "button"])(
    "drops onto the %s directly through upload and the canonical save without a dialog",
    async (where) => {
        await mount();
        const photo = file();
        const target =
            where === "logo"
                ? mark()
                : where === "post"
                  ? post()
                  : screen.getByRole("button", { name: "Add Site mark" });
        drop(target, [photo]);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await waitFor(() =>
            expect(onSave).toHaveBeenCalledWith(
                where === "post"
                    ? {
                          kind: "page-widget-text",
                          pageId: "home",
                          widgetId: "post",
                      }
                    : {
                          kind: "shared-widget-text",
                          pageId: "home",
                          name: "anahataHeader",
                      },
                where === "post" ? "posts.0.thumbnail" : "logoSource",
                placeholder,
                { kind: "media", media },
            ),
        );
        expect(mockUpload).toHaveBeenCalledWith(photo, { type: "page" });
        await waitFor(() =>
            expect(screen.queryByRole("status")).not.toBeInTheDocument(),
        );
    },
);

it("offers a 44px icon control on the compact logo without a wrapped label outside the viewport", async () => {
    await mount();
    const button = screen.getByRole("button", { name: "Add Site mark" });
    expect(button).toHaveStyle({
        width: "44px",
        height: "44px",
        left: "0px",
        right: "auto",
    });
    expect(button).toHaveAttribute(
        "title",
        "Click to choose an image, or drop one here",
    );
    expect(button.textContent).toBe("");
});

it("keeps one upload in flight even when two drops arrive before a render", async () => {
    let finish!: (value: typeof media) => void;
    mockUpload.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    await mount();
    act(() => {
        drop(mark(), [file()]);
        drop(post(), [file()]);
    });
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Saving image");
    await act(async () => finish(media));
    expect(onSave).toHaveBeenCalledTimes(1);
});

it("reports a failed direct drop in place and permits retry", async () => {
    mockUpload.mockRejectedValueOnce(new Error("Storage unavailable"));
    await mount();
    drop(mark(), [file()]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "Storage unavailable",
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    drop(mark(), [file()]);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() =>
        expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
});

it.each(["multiple", "svg", "large"])(
    "refuses %s files before uploading",
    async (kind) => {
        await mount();
        const oversized = file();
        Object.defineProperty(oversized, "size", { value: 51 * 1024 * 1024 });
        const files =
            kind === "multiple"
                ? [file(), file()]
                : kind === "svg"
                  ? [new File(["svg"], "x.svg", { type: "image/svg+xml" })]
                  : [oversized];
        drop(mark(), files);
        expect(await screen.findByRole("alert")).toBeVisible();
        expect(mockUpload).not.toHaveBeenCalled();
        expect(onSave).not.toHaveBeenCalled();
    },
);

it("does not upload while editing is disabled and removes its interception when unmounted", async () => {
    const ui = await mount(true);
    const event = createEvent.drop(mark(), {
        dataTransfer: { files: [file()], types: ["Files"] },
    });
    fireEvent(mark(), event);
    expect(event.defaultPrevented).toBe(true);
    expect(mockUpload).not.toHaveBeenCalled();
    ui.unmount();
    const click = createEvent.click(mark());
    fireEvent(mark(), click);
    expect(click.defaultPrevented).toBe(false);
});

it("does not hijack a modal's image input or an unregistered placeholder", async () => {
    await mount();
    const modal = document.createElement("div");
    modal.dataset.feedbackUi = "";
    modal.innerHTML = '<div data-asset="waiting">Other picker</div>';
    document.body.append(modal);
    drop(modal.firstElementChild!, [file()]);
    drop(document.body, [file()]);
    expect(mockUpload).not.toHaveBeenCalled();
});

it("highlights an image drop target, clears on leaving, and ignores ordinary text drags", async () => {
    await mount();
    const transfer = { types: ["Files"], dropEffect: "none" };
    fireEvent.dragOver(mark(), { dataTransfer: transfer });
    const control = document.querySelector(
        '[data-kk-image-control="header:logoSource"]',
    );
    expect(transfer.dropEffect).toBe("copy");
    expect(control).toHaveStyle({ outline: "3px solid #ad643f" });
    fireEvent.dragLeave(mark(), { relatedTarget: document.body });
    expect(control).not.toHaveStyle({ outline: "3px solid #ad643f" });
    const text = createEvent.dragOver(mark(), {
        dataTransfer: { types: ["text/plain"] },
    });
    fireEvent(mark(), text);
    expect(text.defaultPrevented).toBe(false);
});

it("preserves clicks on filled images but supports dropping their replacement", async () => {
    const previous: ImageSource = { kind: "media", media };
    await mount(false, previous);
    const click = createEvent.click(mark());
    fireEvent(mark(), click);
    expect(click.defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    drop(mark(), [file()]);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2]).toEqual(previous);
});

it("makes decorative wells hit-testable only in Edit page and saves the nested slot", async () => {
    const style = document.createElement("style");
    style.textContent = readFileSync(
        join(__dirname, "../text-edit.css"),
        "utf8",
    );
    document.head.append(style);
    const slot = post();
    // Hero wordmarks and footer/private decorations inherit this from their wrapper.
    slot.style.pointerEvents = "none";
    const well = slot.firstElementChild!;
    const filled = document.createElement("img");
    slot.append(filled);
    // The outer banner is also an image slot, so a pointer-transparent inner
    // well would otherwise let a real drop replace the banner behind it.
    slot.parentElement!.setAttribute(
        "data-kk-image-path",
        "bannerImage.source",
    );
    try {
        // jsdom does not resolve this inherited value; native Chrome supplies
        // the actual hit-test proof. Assert only the mode-scoped override here.
        expect(getComputedStyle(well).pointerEvents).not.toBe("auto");
        document.documentElement.dataset.kkTextEdit = "";
        expect(getComputedStyle(well).pointerEvents).toBe("auto");
        expect(getComputedStyle(filled).pointerEvents).not.toBe("auto");
        await mount();
        drop(well, [file()]);
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave.mock.calls[0][1]).toBe("posts.0.thumbnail");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        delete document.documentElement.dataset.kkTextEdit;
        expect(getComputedStyle(well).pointerEvents).not.toBe("auto");
    } finally {
        delete document.documentElement.dataset.kkTextEdit;
        style.remove();
    }
});

describe("image geometry after loading", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const frame = () => act(() => jest.advanceTimersByTime(32));

    it.each(["image", "wrapper"])(
        "discovers all three late-loading %s slots without a scroll, resize or DOM replacement",
        (marker) => {
            const paths = [4, 8, 12].map(
                (position) => `text.content.${position}.attrs.kkImageSource`,
            );
            const content = leaves();
            content.widgets.push({
                widgetId: "rich",
                name: "richText",
                shared: false,
                leaves: [],
                images: paths.map((path, position) => ({
                    path,
                    label: `Portrait ${position + 1}`,
                    value: { kind: "media", media },
                })),
            });
            const article = document.createElement("article");
            article.dataset.feedbackId = "rich";
            article.innerHTML = paths
                .map((path) =>
                    marker === "image"
                        ? `<img data-kk-image-path="${path}" loading="lazy" src="/portrait.png">`
                        : `<div data-kk-image-path="${path}"><img loading="lazy" src="/portrait.png"></div>`,
                )
                .join("");
            document.querySelector("[data-feedback-page]")!.append(article);
            const loaded = new Set<Element>();
            rect.mockImplementation(function (this: HTMLElement) {
                const image =
                    this instanceof HTMLImageElement
                        ? this
                        : this.querySelector("img");
                return {
                    width: image && !loaded.has(image) ? 0 : 468,
                    height: image && !loaded.has(image) ? 0 : 655,
                    left: 24,
                    top: 45,
                } as DOMRect;
            });
            const ui = render(
                <ImageEditControls
                    pageId="home"
                    index={indexLeaves(content)}
                    disabled={false}
                    onSave={onSave}
                    onBusy={onBusy}
                />,
            );
            frame();
            expect(
                screen.queryAllByRole("button", { name: /Portrait/ }),
            ).toHaveLength(0);
            article.querySelectorAll("img").forEach((image, position) => {
                loaded.add(image);
                frame();
                expect(
                    screen.queryByRole("button", {
                        name: `Replace Portrait ${position + 1}`,
                    }),
                ).not.toBeInTheDocument();
                // Native image load does not bubble; intrinsic dimensions can
                // appear without any child-list mutation or scrolling.
                fireEvent(image, new Event("load", { bubbles: false }));
                frame();
                const button = screen.getByRole("button", {
                    name: `Replace Portrait ${position + 1}`,
                });
                expect(button.closest("[data-kk-image-control]")).toHaveStyle({
                    width: "468px",
                    height: "655px",
                });
            });
            expect(
                screen.getAllByRole("button", { name: /Replace Portrait/ }),
            ).toHaveLength(3);
            const reads = rect.mock.calls.length;
            frame();
            expect(rect).toHaveBeenCalledTimes(reads);
            ui.unmount();
            fireEvent.load(article.querySelector("img")!);
            frame();
            expect(rect).toHaveBeenCalledTimes(reads);
        },
    );

    it("remeasures other slots when page images load, without reacting to its own picker previews", () => {
        const image = document.createElement("img");
        document.querySelector("[data-feedback-page]")!.prepend(image);
        let top = 45;
        rect.mockImplementation(
            () => ({ width: 40, height: 40, left: 24, top }) as DOMRect,
        );
        render(
            <ImageEditControls
                pageId="home"
                index={indexLeaves(leaves())}
                disabled={false}
                onSave={onSave}
                onBusy={onBusy}
            />,
        );
        frame();
        const control = () =>
            document.querySelector(
                '[data-kk-image-control="header:logoSource"]',
            );
        expect(control()).toHaveStyle({ top: "45px" });
        top = 200;
        fireEvent.load(image);
        frame();
        expect(control()).toHaveStyle({ top: "200px" });
        const preview = document.createElement("img");
        control()!.append(preview);
        frame();
        const reads = rect.mock.calls.length;
        fireEvent.load(preview);
        frame();
        expect(rect).toHaveBeenCalledTimes(reads);
    });
});
