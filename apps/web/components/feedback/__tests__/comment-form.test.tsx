import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommentForm from "../comment-form";
import { pageSelection } from "../targets";
import { feedbackRequest } from "../api";

jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
const mockUploadFile = jest.fn();
jest.mock("@courselit/components-library", () => ({
    useMediaLit: (options) => ({
        isUploading: false,
        uploadFile: (file, metadata) => mockUploadFile(file, metadata, options),
    }),
    MediaSelector: ({ onSelection, onRemove }) => (
        <div>
            Admin attachment control
            <button
                type="button"
                onClick={() => onSelection({ mediaId: "test-photo" })}
            >
                Attach test photo
            </button>
            {/* The native Remove control currently has no explicit button type. */}
            <button onClick={onRemove}>Remove test photo</button>
        </div>
    ),
}));
jest.mock("@/components/ui/dialog", () => ({
    DialogTitle: ({ children }) => <h2>{children}</h2>,
    DialogDescription: ({ children }) => <p>{children}</p>,
}));

beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
});

test("public feedback has no attachment control and a failed submission retains a recoverable tab draft", async () => {
    jest.mocked(feedbackRequest).mockRejectedValueOnce(
        new Error("Connection lost"),
    );
    const props = {
        selection: pageSelection("/practice"),
        profile: null,
        address: {} as any,
        admin: false,
        onSent: jest.fn(),
    };
    const first = render(<CommentForm {...props} />);
    expect(
        screen.queryByText("Admin attachment control"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "  Please explain the practice length.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send comment" }));
    await screen.findByRole("alert");
    expect(props.onSent).not.toHaveBeenCalled();
    first.unmount();
    render(<CommentForm {...props} />);
    await waitFor(() =>
        expect(screen.getByRole("textbox")).toHaveValue(
            "  Please explain the practice length.  ",
        ),
    );
    jest.mocked(feedbackRequest).mockResolvedValueOnce({
        feedback: { id: "received" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send comment" }));
    await waitFor(() => expect(props.onSent).toHaveBeenCalledTimes(1));
    expect(sessionStorage.length).toBe(0);
    expect(feedbackRequest).toHaveBeenLastCalledWith("/api/feedback", {
        text: "Please explain the practice length.",
        target: props.selection.target,
    });
});

test("Send remains in a separate header when long context, attachment controls and an error need body scrolling", async () => {
    jest.mocked(feedbackRequest).mockRejectedValue(new Error("Offline"));
    const onClose = jest.fn();
    render(
        <CommentForm
            selection={{
                ...pageSelection("/long"),
                label: "A long selected context ".repeat(10),
            }}
            profile={{ userId: "admin" }}
            address={{} as any}
            admin
            onSent={jest.fn()}
            onClose={onClose}
        />,
    );
    const send = screen.getByRole("button", { name: "Send comment" });
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("maxlength", "4000");
    expect(send.closest("header")).not.toBeNull();
    expect(send.closest("header")).not.toHaveTextContent(
        "A long selected context",
    );
    expect(send.closest(".kk-comment-body")).toBeNull();
    expect(textarea.closest(".kk-comment-body")).not.toBeNull();
    fireEvent.change(textarea, {
        target: { value: "Retain this unsent draft" },
    });
    fireEvent.click(send);
    await screen.findByRole("alert");
    expect(send).not.toBeDisabled();
    expect(textarea).toHaveValue("Retain this unsent draft");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(1);
});

test("typing Enter adds a newline; only activating the focused Send button sends the comment", async () => {
    const user = userEvent.setup();
    jest.mocked(feedbackRequest).mockResolvedValue({
        feedback: { id: "sent" },
    });
    const onSent = jest.fn();
    render(
        <CommentForm
            selection={pageSelection("/practice")}
            profile={null}
            address={{} as any}
            admin={false}
            onSent={onSent}
        />,
    );
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "First line{Enter}Second line");
    expect(textarea).toHaveValue("First line\nSecond line");
    expect(feedbackRequest).not.toHaveBeenCalled();
    screen.getByRole("button", { name: "Send comment" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(feedbackRequest).toHaveBeenCalledTimes(1);
});

test("a nested attachment button cannot implicitly submit a drafted comment", async () => {
    const user = userEvent.setup();
    render(
        <CommentForm
            selection={pageSelection("/practice")}
            profile={{ userId: "admin" }}
            address={{} as any}
            admin
            onSent={jest.fn()}
        />,
    );
    await user.type(
        screen.getByRole("textbox"),
        "Keep this draft while removing its photo",
    );
    await user.click(screen.getByRole("button", { name: "Attach test photo" }));
    await user.click(screen.getByRole("button", { name: "Remove test photo" }));
    expect(feedbackRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue(
        "Keep this draft while removing its photo",
    );
});

const pngFile = () =>
    new File([new Uint8Array([137, 80, 78, 71])], "", { type: "image/png" });

test("an admin pasting an image uploads it privately and attaches it to the comment", async () => {
    mockUploadFile.mockImplementation(async (file, metadata, options) => {
        const media = {
            mediaId: "pasted-photo",
            originalFileName: file.name,
            thumbnail: "",
        };
        options.onUploadComplete(media);
        return media;
    });
    jest.mocked(feedbackRequest).mockResolvedValue({
        feedback: { id: "sent" },
    });
    const onSent = jest.fn();
    render(
        <CommentForm
            selection={pageSelection("/practice")}
            profile={{ userId: "admin" }}
            address={{ backend: "https://site.test" } as any}
            admin
            onSent={onSent}
        />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "See the screenshot" } });
    fireEvent.paste(textarea, { clipboardData: { files: [pngFile()] } });
    await waitFor(() => expect(mockUploadFile).toHaveBeenCalledTimes(1));
    const [file, metadata, options] = mockUploadFile.mock.calls[0];
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("pasted-image.png");
    expect(metadata).toEqual({ caption: "", type: "page" });
    expect(options).toMatchObject({
        access: "private",
        signatureEndpoint: "https://site.test/api/media/presigned",
    });
    expect(textarea).toHaveValue("See the screenshot");
    fireEvent.click(screen.getByRole("button", { name: "Send comment" }));
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(feedbackRequest).toHaveBeenLastCalledWith("/api/feedback", {
        text: "See the screenshot",
        target: pageSelection("/practice").target,
        photoMediaIds: ["pasted-photo"],
    });
});

test("a failed pasted-image upload reports itself and keeps the text draft", async () => {
    mockUploadFile.mockRejectedValue(new Error("Failed to obtain signature"));
    render(
        <CommentForm
            selection={pageSelection("/practice")}
            profile={{ userId: "admin" }}
            address={{ backend: "https://site.test" } as any}
            admin
            onSent={jest.fn()}
        />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Draft stays" } });
    fireEvent.paste(textarea, { clipboardData: { files: [pngFile()] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "The pasted image did not upload. Your text is kept.",
    );
    expect(textarea).toHaveValue("Draft stays");
    expect(feedbackRequest).not.toHaveBeenCalled();
});

test("members and visitors cannot attach by pasting; text pastes are untouched", async () => {
    render(
        <CommentForm
            selection={pageSelection("/practice")}
            profile={{ userId: "member" }}
            address={{ backend: "https://site.test" } as any}
            admin={false}
            onSent={jest.fn()}
        />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.paste(textarea, { clipboardData: { files: [pngFile()] } });
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
        screen.queryByText(
            "Or paste an image from the clipboard while typing.",
        ),
    ).not.toBeInTheDocument();
});
