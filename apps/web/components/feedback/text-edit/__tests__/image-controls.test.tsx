import React from "react";
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
