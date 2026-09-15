import React from "react";
import {
    act,
    fireEvent,
    render,
    renderHook,
    screen,
    waitFor,
} from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type {
    ImageSource,
    PageTextLeaves,
    TextChange,
    TextEdit,
    TextEditTarget,
} from "@courselit/common-models";
import { useTextEdit } from "../use-text-edit";
import { currentAt, indexLeaves } from "../leaves";
import { fetchLeaves, fetchHistory, submitEdit } from "../api";
import HistoryPanel from "../history";
import { ImageEditControls } from "../image-controls";

jest.mock("../api", () => ({
    fetchLeaves: jest.fn(),
    fetchHistory: jest.fn(),
    submitEdit: jest.fn(),
}));
jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }) =>
        open ? <div role="dialog">{children}</div> : null,
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
    DialogDescription: ({ children }) => <p>{children}</p>,
}));
const mockUpload = jest.fn();
jest.mock("@courselit/components-library/images", () => ({
    ImageFileInput: ({ onFile }) => (
        <button
            onClick={() =>
                void onFile(
                    new File(["image"], "image.png", { type: "image/png" }),
                )
            }
        >
            Test file selection
        </button>
    ),
    maybeDownsizeImage: async (file) => ({ file }),
    useMediaLit: () => ({
        uploadFile: mockUpload,
        uploadProgress: 0,
        isUploading: false,
        cancelUpload: jest.fn(),
    }),
}));

const target: TextEditTarget = {
    kind: "page-widget-text",
    pageId: "home",
    widgetId: "hero",
};
const placeholder: ImageSource = {
    kind: "placeholder",
    description: "Portrait",
};
const first: ImageSource = {
    kind: "media",
    media: { mediaId: "first", file: "https://media.test/first.jpg" } as any,
};
const second: ImageSource = { kind: "url", url: "/second.jpg" };
const path = "imageSource";
const leaves = (value: ImageSource = placeholder): PageTextLeaves => ({
    pageId: "home",
    revision: 1,
    widgets: [
        {
            widgetId: "hero",
            name: "anahataHero",
            shared: false,
            leaves: [],
            images: [{ path, value, label: "Hero portrait" }],
        },
    ],
});
let nextId = 0;
function edit(changes: TextChange[], undoOf?: string): TextEdit {
    return {
        editId: `image-${++nextId}`,
        target,
        widgetName: "anahataHero",
        userId: "admin",
        at: "2026-09-15T20:00:00Z",
        revision: nextId,
        changes,
        ...(undoOf ? { undoOf } : {}),
    };
}
const change = (before: ImageSource, after: ImageSource): TextChange => ({
    kind: "image",
    path,
    before,
    after,
});
const refresh = jest.fn();
beforeEach(() => {
    jest.clearAllMocks();
    nextId = 0;
    document.body.innerHTML =
        '<div data-feedback-page="home"><div data-feedback-id="hero"><div data-kk-image-path="imageSource"></div></div></div>';
    jest.mocked(fetchLeaves).mockResolvedValue(leaves());
    jest.mocked(fetchHistory).mockResolvedValue({
        edits: [],
        nextCursor: null,
    });
    jest.mocked(submitEdit).mockImplementation(async (input) => ({
        kind: "applied",
        edit: edit(input.changes, input.undoOf),
    }));
    mockUpload.mockResolvedValue(first.kind === "media" ? first.media : {});
    global.ResizeObserver = class {
        observe() {}
        disconnect() {}
        unobserve() {}
    } as typeof ResizeObserver;
});
async function start() {
    const hook = renderHook(() => useTextEdit(true), {
        wrapper: ({ children }) => (
            <AppRouterContext.Provider value={{ refresh } as any}>
                {children}
            </AppRouterContext.Provider>
        ),
    });
    await act(async () => hook.result.current.start());
    expect(hook.result.current.mode.kind).toBe("on");
    return hook;
}
function value(hook: Awaited<ReturnType<typeof start>>) {
    const mode = hook.result.current.mode;
    return mode.kind === "on" ? currentAt(mode.index, target, path) : undefined;
}

it("saves, undoes, redoes and restores image history against the current image", async () => {
    const hook = await start();
    let saved!: TextEdit;
    await act(async () => {
        saved = await hook.result.current.saveImage(
            target,
            path,
            placeholder,
            first,
        );
    });
    expect(value(hook)).toEqual(first);
    expect(hook.result.current.canUndo).toBe(true);
    await act(async () => hook.result.current.undo());
    expect(value(hook)).toEqual(placeholder);
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(true);
    await act(async () => hook.result.current.redo());
    expect(value(hook)).toEqual(first);
    await act(async () =>
        hook.result.current.saveImage(target, path, first, second),
    );
    await act(async () => hook.result.current.restore(saved));
    expect(submitEdit).toHaveBeenLastCalledWith({
        target,
        undoOf: saved.editId,
        changes: [change(second, placeholder)],
    });
    expect(value(hook)).toEqual(placeholder);
    await act(async () => hook.result.current.undo());
    expect(value(hook)).toEqual(second);
});

it.each(["refused", "throw"])(
    "retains the image undo entry after %s and permits retry",
    async (failure) => {
        const hook = await start();
        await act(async () =>
            hook.result.current.saveImage(target, path, placeholder, first),
        );
        if (failure === "throw")
            jest.mocked(submitEdit).mockRejectedValueOnce(
                new Error("Lost acknowledgment"),
            );
        else
            jest.mocked(submitEdit).mockResolvedValueOnce({
                kind: "refused",
                message: "Unavailable",
            } as any);
        await act(async () => hook.result.current.undo());
        expect(value(hook)).toEqual(first);
        expect(hook.result.current.canUndo).toBe(true);
        expect(hook.result.current.canRedo).toBe(false);
        await act(async () => hook.result.current.undo());
        expect(value(hook)).toEqual(placeholder);
        expect(hook.result.current.canRedo).toBe(true);
    },
);

it("resynchronizes a stale image reversal as an image leaf", async () => {
    const hook = await start();
    await act(async () =>
        hook.result.current.saveImage(target, path, placeholder, first),
    );
    jest.mocked(submitEdit).mockResolvedValueOnce({
        kind: "stale",
        message: "Another editor changed it",
        current: [{ path, value: second }],
    } as any);
    await act(async () => hook.result.current.undo());
    expect(value(hook)).toEqual(second);
    expect(hook.result.current.canUndo).toBe(true);
});

it("shows both saved versions and disables History restore when its previous image is current", async () => {
    const record = edit([change(placeholder, first)]);
    jest.mocked(fetchHistory).mockResolvedValue({
        edits: [record],
        nextCursor: null,
    });
    const onRestore = jest.fn().mockResolvedValue(record);
    const current = jest.fn().mockReturnValue(first);
    const ui = render(
        <HistoryPanel
            pageId="home"
            userId="admin"
            current={current}
            onRestore={onRestore}
            refreshKey={1}
        />,
    );
    expect(await screen.findByText("Placeholder: Portrait")).toBeVisible();
    expect(
        screen.getByRole("img", { name: "Saved page image" }),
    ).toHaveAttribute("src", "https://media.test/first.jpg");
    fireEvent.click(
        screen.getByRole("button", { name: "Restore previous image" }),
    );
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(record));
    current.mockReturnValue(placeholder);
    ui.rerender(
        <HistoryPanel
            pageId="home"
            userId="admin"
            current={current}
            onRestore={onRestore}
            refreshKey={1}
        />,
    );
    expect(
        screen.queryByRole("button", { name: "Restore previous image" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
});

it("refreshes the page after an image save acknowledgment is lost", async () => {
    const hook = await start();
    jest.mocked(submitEdit).mockRejectedValueOnce(
        new Error("Network lost after server save"),
    );
    await act(async () => {
        await hook.result.current
            .saveImage(target, path, placeholder, first)
            .catch(() => undefined);
    });
    expect(refresh).toHaveBeenCalled();
    expect(hook.result.current.busy).toBe(false);
});

it("uses refreshed image state when an open replacement dialog retries", async () => {
    const rect = jest
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue({
            width: 200,
            height: 100,
            top: 0,
            left: 0,
        } as DOMRect);
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onBusy = jest.fn();
    const ui = render(
        <ImageEditControls
            pageId="home"
            index={indexLeaves(leaves(placeholder))}
            disabled={false}
            onSave={onSave}
            onBusy={onBusy}
        />,
    );
    fireEvent.click(
        await screen.findByRole("button", { name: "Add Hero portrait" }),
    );
    ui.rerender(
        <ImageEditControls
            pageId="home"
            index={indexLeaves(leaves(second))}
            disabled={false}
            onSave={onSave}
            onBusy={onBusy}
        />,
    );
    await screen.findByRole("button", { name: "Replace Hero portrait" });
    fireEvent.click(
        screen.getByRole("button", { name: "Test file selection" }),
    );
    await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(target, path, second, first),
    );
    rect.mockRestore();
});

it("brings an off-screen image into view when its portal control receives keyboard focus", async () => {
    const rect = jest
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue({
            width: 200,
            height: 100,
            top: 1200,
            bottom: 1300,
            left: 0,
        } as DOMRect);
    const image = document.querySelector<HTMLElement>("[data-kk-image-path]")!;
    image.scrollIntoView = jest.fn();
    render(
        <ImageEditControls
            pageId="home"
            index={indexLeaves(leaves(placeholder))}
            disabled={false}
            onSave={jest.fn()}
            onBusy={jest.fn()}
        />,
    );
    const button = await screen.findByRole("button", {
        name: "Add Hero portrait",
    });
    fireEvent.focus(button);
    expect(image.scrollIntoView).toHaveBeenCalledWith({
        block: "start",
        inline: "nearest",
    });
    jest.mocked(image.scrollIntoView).mockClear();
    rect.mockReturnValue({
        width: 200,
        height: 100,
        top: 100,
        bottom: 200,
        left: 0,
    } as DOMRect);
    fireEvent.focus(button);
    expect(image.scrollIntoView).not.toHaveBeenCalled();
    rect.mockRestore();
});
