import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { ProfileContext } from "@/components/contexts";
import { ClosingGift } from "../closing-gift";
import { billingCopy } from "../copy";
import { feedbackUi } from "@/config/strings";

jest.mock(
    "next/dynamic",
    () => () => require("@/components/feedback/comment-form").default,
);
jest.mock("@courselit/components-library", () => ({
    MediaSelector: () => {
        throw new Error("Member feedback must not mount photo controls");
    },
}));

afterEach(() => {
    cleanup();
    sessionStorage.clear();
});

test("farewell feedback closes to its opener and reopening retains the unsent draft", async () => {
    const originalFetch = global.fetch;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    try {
        render(
            <ProfileContext.Provider
                value={{
                    profile: { userId: "member-fixture", permissions: [] },
                    setProfile: jest.fn(),
                }}
            >
                <ClosingGift readOnly={false} />
            </ProfileContext.Provider>,
        );
        const opener = screen.getByRole("button", {
            name: billingCopy.feedback,
        });
        opener.focus();
        fireEvent.click(opener);
        const dialog = screen.getByRole("dialog");
        const header = dialog.querySelector(
            ".kk-comment-header",
        ) as HTMLElement;
        fireEvent.change(
            screen.getByRole("textbox", { name: feedbackUi.commentLabel }),
            { target: { value: "Unsent farewell draft" } },
        );
        expect(
            within(header).getByRole("button", { name: feedbackUi.sendLabel }),
        ).toBeEnabled();
        fireEvent.click(
            within(header).getByRole("button", { name: feedbackUi.close }),
        );
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await waitFor(() => expect(opener).toHaveFocus());
        expect(fetchSpy).not.toHaveBeenCalled();
        screen.getByRole("link", { name: billingCopy.library }).focus();
        opener.focus();
        fireEvent.click(opener);
        expect(
            screen.getByRole("textbox", { name: feedbackUi.commentLabel }),
        ).toHaveValue("Unsent farewell draft");
        expect(screen.queryByText(feedbackUi.photo)).not.toBeInTheDocument();
        fireEvent.keyDown(document.activeElement!, { key: "Escape" });
        await waitFor(() => expect(opener).toHaveFocus());
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
        global.fetch = originalFetch;
    }
});

test("read-only Mimic never opens farewell feedback", () => {
    render(<ClosingGift readOnly />);
    const opener = screen.getByRole("button", { name: billingCopy.feedback });
    expect(opener).toBeDisabled();
    fireEvent.click(opener);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
