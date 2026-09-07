import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CommentForm from "../comment-form";
import { pageSelection } from "../targets";
import { feedbackRequest } from "../api";

jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
jest.mock("@courselit/components-library", () => ({
    MediaSelector: () => <div>Admin attachment control</div>,
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
        target: { value: "Please explain the practice length." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send comment" }));
    await screen.findByRole("alert");
    expect(props.onSent).not.toHaveBeenCalled();
    first.unmount();
    render(<CommentForm {...props} />);
    await waitFor(() =>
        expect(screen.getByRole("textbox")).toHaveValue(
            "Please explain the practice length.",
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
