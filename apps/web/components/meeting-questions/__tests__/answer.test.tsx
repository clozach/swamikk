import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import type {
    MeetingQuestionAnswer,
    MeetingQuestionViewer,
} from "@courselit/common-models";
import MeetingAnswer from "../answer";
import { saveMeetingAnswer } from "../api";
import { meetingQuestionsUi as copy } from "@config/strings";

jest.mock("../api", () => ({ saveMeetingAnswer: jest.fn() }));
const viewer: MeetingQuestionViewer = { userId: "alice", name: "Alice" };
const answer = (text = "Original", revision = 1): MeetingQuestionAnswer => ({
    id: "answer",
    setId: "meeting",
    questionId: "q01",
    author: { kind: "account", ...viewer },
    text,
    revision,
    history: [],
    updatedAt: "2026-09-15T09:00:00Z",
});
const props = (answers = [answer()]) => ({
    setId: "meeting",
    questionId: "q01",
    answers,
    viewer,
    onSaved: jest.fn().mockResolvedValue(undefined),
});
const save = () =>
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
const type = (text: string) =>
    fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
beforeEach(() => {
    jest.resetAllMocks();
    sessionStorage.clear();
    let id = 0;
    Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        value: jest.fn(() => `attempt-${++id}`),
    });
});

test("refresh updates a pristine own answer and preserves another person's answer", async () => {
    const first = props();
    const view = render(<MeetingAnswer {...first} />);
    const other = {
        ...answer("Bob's answer"),
        id: "bob",
        author: { kind: "account" as const, userId: "bob", name: "Bob" },
    };
    view.rerender(
        <MeetingAnswer
            {...first}
            answers={[answer("Updated elsewhere", 2), other]}
        />,
    );
    await waitFor(() =>
        expect(screen.getByRole("textbox")).toHaveValue("Updated elsewhere"),
    );
    expect(screen.getByText("Bob's answer")).toBeInTheDocument();
});

test("closing and reopening a stale draft requires explicit rebase", async () => {
    const first = render(<MeetingAnswer {...props()} />);
    type("My draft");
    first.unmount();
    render(<MeetingAnswer {...props([answer("Other tab", 2)])} />);
    expect(screen.getByRole("textbox")).toHaveValue("My draft");
    await waitFor(() =>
        expect(screen.getByText(copy.conflict)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: copy.save })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: copy.keepDraft }));
    (saveMeetingAnswer as jest.Mock).mockResolvedValue({
        kind: "saved",
        answer: answer("My draft", 3),
        appliedRevision: 3,
    });
    save();
    await waitFor(() =>
        expect(saveMeetingAnswer).toHaveBeenCalledWith(
            expect.objectContaining({ expectedRevision: 2, text: "My draft" }),
        ),
    );
});

test("an uncertain save retains its mutation identity across close and newer typing", async () => {
    (saveMeetingAnswer as jest.Mock).mockRejectedValueOnce(
        new Error("Network lost"),
    );
    const first = render(<MeetingAnswer {...props()} />);
    type("First edit");
    save();
    await screen.findByRole("alert");
    const sent = (saveMeetingAnswer as jest.Mock).mock.calls[0][0];
    first.unmount();
    render(<MeetingAnswer {...props()} />);
    type("More edits after timeout");
    (saveMeetingAnswer as jest.Mock).mockResolvedValue({
        kind: "saved",
        answer: answer("First edit", 2),
        appliedRevision: 2,
    });
    fireEvent.click(
        screen.getByRole("button", { name: /Retry save|Save answer/ }),
    );
    await waitFor(() => expect(saveMeetingAnswer).toHaveBeenCalledTimes(2));
    expect((saveMeetingAnswer as jest.Mock).mock.calls[1][0]).toEqual(sent);
    expect(screen.getByRole("textbox")).toHaveValue("More edits after timeout");
});

test("typing while saving survives both settlement and refresh failure", async () => {
    let finish!: (value: unknown) => void;
    (saveMeetingAnswer as jest.Mock).mockImplementation(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const input = props();
    input.onSaved.mockRejectedValue(new Error("Refresh lost"));
    render(<MeetingAnswer {...input} />);
    type("Submitted");
    save();
    await waitFor(() => expect(saveMeetingAnswer).toHaveBeenCalledTimes(1));
    type("Still typing");
    await act(async () => {
        finish({
            kind: "saved",
            answer: answer("Submitted", 2),
            appliedRevision: 2,
        });
    });
    expect(screen.getByRole("textbox")).toHaveValue("Still typing");
    expect(screen.getByRole("button", { name: copy.save })).toBeEnabled();
    expect(screen.queryByText(/Refresh lost/)).not.toBeInTheDocument();
});

test("viewer changes immediately discard the previous viewer's rendered draft", () => {
    const input = props();
    const view = render(<MeetingAnswer {...input} />);
    type("Alice private draft");
    view.rerender(
        <MeetingAnswer {...input} viewer={{ userId: "bob", name: "Bob" }} />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
});

test("a 409 retains the draft until the author explicitly accepts the newer base", async () => {
    (saveMeetingAnswer as jest.Mock).mockResolvedValueOnce({
        kind: "conflict",
        current: answer("Second tab's text", 2),
    });
    render(<MeetingAnswer {...props()} />);
    type("Local choice");
    save();
    await screen.findByText(copy.conflict);
    expect(screen.getByRole("textbox")).toHaveValue("Local choice");
    expect(screen.getByRole("button", { name: copy.save })).toBeDisabled();
    type("Revised local choice");
    expect(screen.getByRole("button", { name: copy.save })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: copy.keepDraft }));
    (saveMeetingAnswer as jest.Mock).mockResolvedValueOnce({
        kind: "saved",
        answer: answer("Revised local choice", 3),
        appliedRevision: 3,
    });
    save();
    await waitFor(() => expect(saveMeetingAnswer).toHaveBeenCalledTimes(2));
    expect((saveMeetingAnswer as jest.Mock).mock.calls[1][0]).toEqual(
        expect.objectContaining({
            expectedRevision: 2,
            text: "Revised local choice",
            mutationId: "attempt-2",
        }),
    );
});

test("an older replay receipt does not silently replace a newer saved answer", async () => {
    (saveMeetingAnswer as jest.Mock).mockResolvedValueOnce({
        kind: "saved",
        answer: answer("Another tab after this save", 3),
        appliedRevision: 2,
        replayed: true,
    });
    render(<MeetingAnswer {...props()} />);
    type("Submitted earlier");
    save();
    await screen.findByText(copy.conflict);
    expect(screen.getByRole("textbox")).toHaveValue("Submitted earlier");
    expect(screen.getByText("Another tab after this save")).toBeInTheDocument();
});

test("settling a closed editor cannot overwrite newer typing in its reopened editor", async () => {
    let finish!: (value: unknown) => void;
    (saveMeetingAnswer as jest.Mock).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const initial = render(<MeetingAnswer {...props()} />);
    type("Submitted");
    save();
    await waitFor(() => expect(saveMeetingAnswer).toHaveBeenCalledTimes(1));
    initial.unmount();
    const reopened = render(<MeetingAnswer {...props()} />);
    type("Reopened draft");
    await act(async () => {
        finish({
            kind: "saved",
            answer: answer("Submitted", 2),
            appliedRevision: 2,
        });
    });
    expect(screen.getByRole("textbox")).toHaveValue("Reopened draft");
    reopened.unmount();
    render(<MeetingAnswer {...props()} />);
    expect(screen.getByRole("textbox")).toHaveValue("Reopened draft");
    expect(screen.getByRole("button", { name: copy.retry })).toBeEnabled();
});

test("storage quota failure still retains an unsent draft across modal close", () => {
    const failWrite = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
            throw new Error("Quota full");
        });
    const initial = render(<MeetingAnswer {...props()} />);
    type("Retain without storage");
    initial.unmount();
    render(<MeetingAnswer {...props()} />);
    expect(screen.getByRole("textbox")).toHaveValue("Retain without storage");
    failWrite.mockRestore();
    type("Original");
});

test("a slow refresh does not lock newer edits or overwrite a later save's state", async () => {
    let finishRefresh!: () => void;
    const input = props();
    input.onSaved.mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                finishRefresh = resolve;
            }),
    );
    (saveMeetingAnswer as jest.Mock)
        .mockResolvedValueOnce({
            kind: "saved",
            answer: answer("First", 2),
            appliedRevision: 2,
        })
        .mockResolvedValueOnce({
            kind: "saved",
            answer: answer("Second", 3),
            appliedRevision: 3,
        });
    render(<MeetingAnswer {...input} />);
    type("First");
    save();
    await screen.findByText(copy.saved);
    type("Second");
    save();
    await waitFor(() => expect(saveMeetingAnswer).toHaveBeenCalledTimes(2));
    expect((saveMeetingAnswer as jest.Mock).mock.calls[1][0]).toEqual(
        expect.objectContaining({ expectedRevision: 2, text: "Second" }),
    );
    await act(async () => {
        finishRefresh();
    });
    expect(screen.getByRole("textbox")).toHaveValue("Second");
});
