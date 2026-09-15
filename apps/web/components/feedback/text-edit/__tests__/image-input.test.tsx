import React from "react";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { ImageFileInput } from "@courselit/components-library/images";

const photo = () => new File(["image"], "photo.png", { type: "image/png" });

it.each(["choose", "paste", "drop"])(
    "saves immediately after %s and reports completion",
    async (method) => {
        const save = jest.fn().mockResolvedValue(undefined);
        render(<ImageFileInput onFile={save} />);
        const file = photo();
        if (method === "choose")
            fireEvent.change(
                screen.getByLabelText("Choose image", { selector: "input" }),
                { target: { files: [file] } },
            );
        if (method === "paste")
            fireEvent.paste(screen.getByRole("group"), {
                clipboardData: { files: [file] },
            });
        if (method === "drop")
            fireEvent.drop(screen.getByRole("group"), {
                dataTransfer: { files: [file] },
            });
        await waitFor(() => expect(save).toHaveBeenCalledWith(file));
        expect(await screen.findByText("Image saved.")).toBeVisible();
    },
);

it("prevents a second selection while saving and allows retry after failure", async () => {
    let fail!: (error: Error) => void;
    const save = jest
        .fn()
        .mockImplementationOnce(
            () =>
                new Promise((_, reject) => {
                    fail = reject;
                }),
        )
        .mockResolvedValue(undefined);
    render(<ImageFileInput onFile={save} />);
    fireEvent.paste(screen.getByRole("group"), {
        clipboardData: { files: [photo()] },
    });
    fireEvent.drop(screen.getByRole("group"), {
        dataTransfer: { files: [photo()] },
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error("Storage is unavailable.")));
    expect(screen.getByRole("alert")).toHaveTextContent(
        "Storage is unavailable.",
    );
    fireEvent.paste(screen.getByRole("group"), {
        clipboardData: { files: [photo()] },
    });
    expect(await screen.findByText("Image saved.")).toBeVisible();
    expect(save).toHaveBeenCalledTimes(2);
});

it("does not read the clipboard without a user gesture and explains permission fallback", async () => {
    const read = jest
        .fn()
        .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { read },
    });
    render(<ImageFileInput onFile={jest.fn()} />);
    expect(read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Paste image" }));
    expect(
        await screen.findByText("Press ⌘V or Ctrl+V here to paste an image."),
    ).toBeVisible();
    expect(read).toHaveBeenCalledTimes(1);
});

it("refuses non-images and multiple dropped files without starting a save", () => {
    const save = jest.fn();
    render(<ImageFileInput onFile={save} />);
    fireEvent.drop(screen.getByRole("group"), {
        dataTransfer: {
            files: [new File(["no"], "x.svg", { type: "image/svg+xml" })],
        },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a JPEG");
    fireEvent.drop(screen.getByRole("group"), {
        dataTransfer: { files: [photo(), photo()] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("one image at a time");
    expect(save).not.toHaveBeenCalled();
});
