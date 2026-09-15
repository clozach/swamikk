import "next/dist/compiled/css.escape";
import {
    act,
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useSearchParams } from "next/navigation";
import type { MeetingQuestionsSnapshot } from "@courselit/common-models";
import ContextualMeetingQuestions from "../index";
import MeetingQuestionsPage from "../page";
import QuestionList from "../question-list";
import { useQuestions } from "../use-questions";

jest.mock("next/navigation", () => ({
    usePathname: jest.fn(),
    useSearchParams: jest.fn(),
}));
jest.mock("../use-questions", () => ({ useQuestions: jest.fn() }));
jest.mock("../answer", () => ({ __esModule: true, default: () => null }));

const snapshot: MeetingQuestionsSnapshot = {
    viewer: { userId: "al", name: "Al" },
    answers: [],
    sets: [
        {
            id: "alpha",
            title: "First meeting",
            intro: "First meeting introduction",
            revision: 1,
            updatedAt: "2026-09-15T09:00:00Z",
            questions: [
                {
                    id: "shared",
                    number: 1,
                    title: "Alpha shared question",
                    group: "start",
                    context: "First welcome decision",
                    candidateGroups: [],
                    locations: [
                        {
                            path: "/",
                            componentId: "welcome",
                            label: "Alpha welcome",
                        },
                    ],
                },
                {
                    id: "only-alpha",
                    number: 2,
                    title: "Alpha footer question",
                    group: "optional",
                    context: "A separate footer decision",
                    candidateGroups: [],
                    locations: [
                        {
                            path: "/",
                            componentId: "footer",
                            label: "Alpha footer",
                        },
                    ],
                },
            ],
        },
        {
            id: "beta",
            title: "Second meeting",
            intro: "Second meeting introduction",
            revision: 1,
            updatedAt: "2026-09-15T09:00:00Z",
            questions: [
                {
                    id: "shared",
                    number: 1,
                    title: "Beta shared question",
                    group: "start",
                    context: "Second welcome decision",
                    candidateGroups: [],
                    locations: [
                        {
                            path: "/",
                            componentId: "welcome",
                            label: "Beta welcome",
                        },
                    ],
                },
            ],
        },
    ],
};
const refresh = jest.fn().mockResolvedValue(undefined);
const scroll = jest.fn();
const search = (value = "") =>
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(value));
function hash(value: string) {
    act(() => {
        window.history.replaceState({}, "", `/meeting-questions#${value}`);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
}
function details(title: string) {
    const element = screen.getByText(title).closest("details");
    if (!(element instanceof HTMLDetailsElement))
        throw new Error("Question details missing");
    return element;
}

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: scroll,
    });
});
afterAll(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, "", "/");
    document.body.innerHTML =
        '<main><section data-feedback-id="welcome"></section><section data-feedback-id="footer"></section></main>';
    (usePathname as jest.Mock).mockReturnValue("/");
    search();
    (useQuestions as jest.Mock).mockReturnValue({
        state: { kind: "ready", data: snapshot },
        permitted: true,
        refresh,
    });
});
afterEach(() => {
    cleanup();
    document.body.replaceChildren();
});

test("a new same-path context query supersedes the manually selected chip", async () => {
    const user = userEvent.setup();
    const view = render(<ContextualMeetingQuestions />);
    await user.click(
        await screen.findByRole("button", { name: /Questions: Alpha footer/ }),
    );
    expect(
        within(screen.getByRole("dialog")).getByText(
            "2. Alpha footer question",
        ),
    ).toBeInTheDocument();
    search(
        "meeting-set=beta&meeting-question=shared&meeting-component=welcome",
    );
    view.rerender(<ContextualMeetingQuestions />);
    await waitFor(() => {
        expect(screen.getByRole("dialog")).toHaveAccessibleName(
            "Second meeting",
        );
        expect(details("1. Beta shared question")).toHaveAttribute("open");
    });
    expect(
        screen.queryByText("2. Alpha footer question"),
    ).not.toBeInTheDocument();
});

test("changing only meeting-set disambiguates the question and reopens a dismissed request", async () => {
    const user = userEvent.setup();
    search(
        "meeting-set=alpha&meeting-question=shared&meeting-component=welcome",
    );
    const view = render(<ContextualMeetingQuestions />);
    expect(
        await screen.findByRole("dialog", { name: "First meeting" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    search(
        "meeting-set=beta&meeting-question=shared&meeting-component=welcome",
    );
    view.rerender(<ContextualMeetingQuestions />);
    expect(
        await screen.findByRole("dialog", { name: "Second meeting" }),
    ).toBeInTheDocument();
    expect(details("1. Beta shared question")).toHaveAttribute("open");
});

test.each(["Close", "Escape"])(
    "%s on the real Sheet returns focus to the exact invoking chip",
    async (dismiss) => {
        const user = userEvent.setup();
        render(<ContextualMeetingQuestions />);
        const opener = await screen.findByRole("button", {
            name: /Questions: Beta welcome/,
        });
        await user.click(opener);
        const panel = await screen.findByRole("dialog", {
            name: "Second meeting",
        });
        await waitFor(() =>
            expect(panel.contains(document.activeElement)).toBe(true),
        );
        if (dismiss === "Close")
            await user.click(
                within(panel).getByRole("button", { name: "Close" }),
            );
        else await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(opener).toHaveFocus());
    },
);

test("a contextual URL returns focus to its matching set's chip on Escape", async () => {
    const user = userEvent.setup();
    search(
        "meeting-set=beta&meeting-question=shared&meeting-component=welcome",
    );
    render(<ContextualMeetingQuestions />);
    await screen.findByRole("dialog", { name: "Second meeting" });
    const opener = document.querySelector<HTMLButtonElement>(
        'button[data-meeting-opener="beta"]',
    );
    expect(opener).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
});

test("context links include the set and encode native component identity", () => {
    const set = {
        ...snapshot.sets[0],
        questions: [
            {
                ...snapshot.sets[0].questions[0],
                locations: [
                    {
                        path: "/p/membership",
                        componentId: "-Zkk_c_EU8FAbdKKlyLW4",
                        label: "Membership context",
                    },
                ],
            },
        ],
    };
    render(<QuestionList set={set} data={snapshot} onSaved={refresh} />);
    const link = screen.getByText("Membership context");
    const url = new URL((link as HTMLAnchorElement).href);
    expect(url.pathname).toBe("/p/membership");
    expect(Array.from(url.searchParams.entries())).toEqual(
        expect.arrayContaining([
            ["meeting-set", "alpha"],
            ["meeting-question", "shared"],
            ["meeting-component", "-Zkk_c_EU8FAbdKKlyLW4"],
        ]),
    );
    expect(Array.from(url.searchParams.entries())).toHaveLength(3);
});

test("qualified all-questions hashes open only the intended set and create unique details IDs", async () => {
    window.history.replaceState({}, "", "/meeting-questions#beta:shared");
    render(<MeetingQuestionsPage />);
    await waitFor(() =>
        expect(details("1. Beta shared question")).toHaveAttribute("open"),
    );
    expect(details("1. Alpha shared question")).not.toHaveAttribute("open");
    expect(details("1. Alpha shared question").id).toBe("alpha:shared");
    expect(details("1. Beta shared question").id).toBe("beta:shared");
    expect(screen.getByText("1. Beta shared question")).toHaveFocus();
});

test("legacy hashes are accepted only when the question ID is globally unambiguous", async () => {
    window.history.replaceState({}, "", "/meeting-questions#shared");
    render(<MeetingQuestionsPage />);
    expect(details("1. Alpha shared question")).not.toHaveAttribute("open");
    expect(details("1. Beta shared question")).not.toHaveAttribute("open");
    hash("only-alpha");
    await waitFor(() =>
        expect(details("2. Alpha footer question")).toHaveAttribute("open"),
    );
    expect(details("1. Alpha shared question")).not.toHaveAttribute("open");
    expect(details("1. Beta shared question")).not.toHaveAttribute("open");
});

test("selector-like unknown hashes or queries cannot open another question", () => {
    window.history.replaceState(
        {},
        "",
        "/meeting-questions#alpha:shared%22%5D%2Cdetails",
    );
    const page = render(<MeetingQuestionsPage />);
    expect(details("1. Alpha shared question")).not.toHaveAttribute("open");
    expect(details("1. Beta shared question")).not.toHaveAttribute("open");
    page.unmount();
    search(
        "meeting-set=alpha&meeting-question=shared%22%5D%2Cdetails&meeting-component=welcome",
    );
    render(<ContextualMeetingQuestions />);
    expect(screen.queryByRole("dialog")).toBeNull();
});
