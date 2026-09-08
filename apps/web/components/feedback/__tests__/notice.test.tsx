import { act, fireEvent, render, screen } from "@testing-library/react";
import { FeedbackNotice, useFeedbackNotice } from "../notice";
import { feedbackUi as copy } from "@config/strings";

function Harness() {
    const [notice, show] = useFeedbackNotice();
    return (
        <>
            <button onClick={() => show(copy.sent)}>Send success</button>
            <button onClick={() => show(copy.copied)}>Copy success</button>
            <button onClick={() => show(copy.loadFailed)}>Failure</button>
            {notice && (
                <FeedbackNotice message={notice} onDismiss={() => show("")} />
            )}
        </>
    );
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

test.each(["Send success", "Copy success"])(
    "%s clears after five seconds",
    (name) => {
        render(<Harness />);
        fireEvent.click(screen.getByText(name));
        act(() => jest.advanceTimersByTime(4999));
        expect(screen.getByRole("status")).toBeInTheDocument();
        act(() => jest.advanceTimersByTime(1));
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    },
);

test("close needs no hover, and errors do not expire", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Failure"));
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByRole("status")).toHaveTextContent(copy.loadFailed);
    fireEvent.click(screen.getByRole("button", { name: copy.close }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("a repeated confirmation gets a full lifetime and replacement error survives the old timer", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Send success"));
    act(() => jest.advanceTimersByTime(4000));
    fireEvent.click(screen.getByText("Send success"));
    act(() => jest.advanceTimersByTime(4000));
    expect(screen.getByRole("status")).toHaveTextContent(copy.sent);
    fireEvent.click(screen.getByText("Failure"));
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByRole("status")).toHaveTextContent(copy.loadFailed);
});
