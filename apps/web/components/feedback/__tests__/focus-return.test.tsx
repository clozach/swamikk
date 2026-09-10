import {
    act,
    render,
    renderHook,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContextualFeedback from "..";
import { ProfileContext } from "@/components/contexts";
import { getPagePrompt } from "../page-prompt";
import { feedbackRequest } from "../api";
import { usePanelFocusReturn } from "../focus-return";

jest.mock("next/navigation", () => ({ usePathname: () => "/practice" }));
jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
jest.mock("../page-prompt", () => ({ getPagePrompt: jest.fn() }));
jest.mock("@courselit/components-library", () => ({
    useMediaLit: () => ({ uploadFile: jest.fn(), isUploading: false }),
    MediaSelector: () => null,
}));
jest.mock("../use-selection", () => ({
    useSelection: () => ({
        mode: { kind: "selected" },
        setMode: jest.fn(),
        rect: null,
        selected: {
            element: null,
            label: "Practice",
            target: { kind: "page", path: "/practice", componentId: "page" },
            authorTarget: { pageId: "practice", widgetId: "text" },
        },
    }),
}));
jest.mock("next/dynamic", () => (loader) => {
    if (String(loader).includes("comment-form")) {
        return function Form(props) {
            return require("react").createElement(
                require("../comment-form").default,
                props,
            );
        };
    }
    return function Editor() {
        const {
            DialogTitle,
            DialogDescription,
        } = require("@/components/ui/dialog");
        return (
            <>
                <DialogTitle>Selected text editor</DialogTitle>
                <DialogDescription>Unsent editor</DialogDescription>
                <input aria-label="Editor text" />
            </>
        );
    };
});

beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as typeof ResizeObserver;
});

function renderAdmin() {
    return render(
        <ProfileContext.Provider
            value={
                {
                    profile: { userId: "admin", permissions: ["site:manage"] },
                    setProfile: jest.fn(),
                } as any
            }
        >
            <ContextualFeedback />
        </ProfileContext.Provider>,
    );
}

test("composer Close restores its actual toolbar opener and preserves the unsent draft", async () => {
    const user = userEvent.setup();
    render(<ContextualFeedback />);
    const opener = screen.getByRole("button", { name: "Add a comment" });
    await user.click(opener);
    await user.type(screen.getByRole("textbox"), "Unsent focus audit");
    await user.click(
        within(screen.getByRole("dialog")).getAllByRole("button", {
            name: "Close",
        })[0],
    );
    await waitFor(() => expect(opener).toHaveFocus());
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(opener);
    expect(screen.getByRole("textbox")).toHaveValue("Unsent focus audit");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
    expect(feedbackRequest).not.toHaveBeenCalled();
});

test.each([
    ["Choose another component", "Choose a part of the page"],
    ["Edit selected text or image", "Selected text editor"],
])("%s returns focus to its own opener on Escape", async (label, title) => {
    const user = userEvent.setup();
    renderAdmin();
    const opener = screen.getByRole("button", { name: label });
    await user.click(opener);
    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
});

test("asynchronous clipboard fallback remembers Copy prompt before it is disabled", async () => {
    const user = userEvent.setup();
    (getPagePrompt as jest.Mock).mockResolvedValue("Synthetic prompt only");
    jest.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
        new Error("Unavailable"),
    );
    renderAdmin();
    const opener = screen.getByRole("button", { name: "Copy prompt" });
    await user.click(opener);
    await screen.findByRole("textbox");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
});

function closeEvent() {
    return new Event("closeAutoFocus", { cancelable: true });
}

test.each(["removed", "disabled", "hidden"])(
    "an %s opener uses the surviving comment control, then help",
    (condition) => {
        const view = render(
            <>
                <button>Original opener</button>
                <button>Comment fallback</button>
                <button>Help fallback</button>
            </>,
        );
        const opener = screen.getByText("Original opener");
        const comment = screen.getByText(
            "Comment fallback",
        ) as HTMLButtonElement;
        const help = screen.getByText("Help fallback") as HTMLButtonElement;
        const { result, unmount } = renderHook(() =>
            usePanelFocusReturn(false),
        );
        act(() => {
            Object.assign(result.current.comment, { current: comment });
            Object.assign(result.current.help, { current: help });
            result.current.remember(opener);
        });
        view.rerender(
            <>
                <button
                    disabled={condition === "disabled"}
                    hidden={condition === "hidden"}
                    style={
                        condition === "removed"
                            ? { display: "none" }
                            : undefined
                    }
                >
                    Original opener
                </button>
                <button>Comment fallback</button>
                <button>Help fallback</button>
            </>,
        );
        if (condition === "removed") opener.remove();
        const event = closeEvent();
        act(() => result.current.restore(event));
        expect(event.defaultPrevented).toBe(true);
        expect(comment).toHaveFocus();
        comment.blur();
        comment.disabled = true;
        act(() => result.current.restore(closeEvent()));
        expect(help).toHaveFocus();
        // Restore external DOM removal before React owns teardown again.
        if (condition === "removed") view.container.prepend(opener);
        unmount();
    },
);

test("a newer modal, reopened panel or deliberate focus move wins over a delayed close", () => {
    render(
        <>
            <button>Opener</button>
            <button>Later focus</button>
        </>,
    );
    const opener = screen.getByText("Opener");
    const later = screen.getByText("Later focus");
    const { result, rerender } = renderHook(
        ({ open }) => usePanelFocusReturn(open),
        { initialProps: { open: false } },
    );
    act(() => result.current.remember(opener));
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.dataset.state = "open";
    document.body.append(modal);
    act(() => result.current.restore(closeEvent()));
    expect(opener).not.toHaveFocus();
    modal.remove();
    rerender({ open: true });
    act(() => result.current.restore(closeEvent()));
    expect(opener).not.toHaveFocus();
    rerender({ open: false });
    later.focus();
    act(() => result.current.restore(closeEvent()));
    expect(later).toHaveFocus();
});

test("navigation and session unmount do not focus a still-connected old opener", () => {
    render(<button>Old page opener</button>);
    const opener = screen.getByText("Old page opener");
    const focus = jest.spyOn(opener, "focus");
    const initialUrl = window.location.href;
    const { result, unmount } = renderHook(() => usePanelFocusReturn(false));
    act(() => result.current.remember(opener));
    window.history.replaceState(null, "", "/different-page");
    act(() => result.current.restore(closeEvent()));
    expect(focus).not.toHaveBeenCalled();
    window.history.replaceState(null, "", initialUrl);
    const restore = result.current.restore;
    unmount();
    restore(closeEvent());
    expect(focus).not.toHaveBeenCalled();
});
