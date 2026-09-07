import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommentForm from "../comment-form";
import { pageSelection } from "../targets";
import { feedbackRequest } from "../api";

jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
jest.mock("@courselit/components-library", () => ({
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
