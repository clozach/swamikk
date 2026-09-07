import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContextualFeedback from "..";
import { ProfileContext } from "@/components/contexts";
import { feedbackRequest } from "../api";

jest.mock("next/navigation", () => ({ usePathname: () => "/practice" }));
jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
jest.mock("@courselit/components-library", () => ({
    MediaSelector: () => {
        const {
            AlertDialog,
            AlertDialogTrigger,
            AlertDialogContent,
            AlertDialogTitle,
            AlertDialogDescription,
            AlertDialogCancel,
        } = require("@/components/ui/alert-dialog");
        return (
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <button type="button">Admin photo</button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogTitle>Private photo</AlertDialogTitle>
                    <AlertDialogDescription>
                        Choose a private attachment
                    </AlertDialogDescription>
                    <AlertDialogCancel>Cancel attachment</AlertDialogCancel>
                </AlertDialogContent>
            </AlertDialog>
        );
    },
}));
jest.mock(
    "next/dynamic",
    () => () =>
        function Form(props) {
            return require("react").createElement(
                require("../comment-form").default,
                props,
            );
        },
);

let viewport: EventTarget & {
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
};
const original = window.visualViewport;
beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
    viewport = Object.assign(new EventTarget(), {
        offsetLeft: 0,
        offsetTop: 0,
        width: 390,
        height: 700,
    });
    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: viewport,
    });
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as typeof ResizeObserver;
});
afterEach(() =>
    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: original,
    }),
);

function open() {
    fireEvent.click(
        screen.getByRole("button", { name: "Comment on this page" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));
}

test("actual composer fills a keyboard-panned viewport and keeps the draft/header intact across resize", () => {
    render(<ContextualFeedback />);
    open();
    const dialog = screen.getByRole("dialog", { name: "Add a comment" });
    expect(dialog).toHaveStyle({
        left: "0px",
        top: "0px",
        width: "390px",
        height: "700px",
        transform: "none",
    });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, {
        target: { value: "Please keep this private unsent draft." },
    });
    act(() => {
        Object.assign(viewport, {
            offsetLeft: 32,
            offsetTop: 260,
            width: 320,
            height: 210,
        });
        viewport.dispatchEvent(new Event("resize"));
    });
    expect(dialog).toHaveStyle({
        left: "32px",
        top: "260px",
        width: "320px",
        height: "210px",
    });
    const send = screen.getByRole("button", { name: "Send comment" });
    expect(send.closest("header")).not.toBeNull();
    expect(send.closest(".kk-comment-body")).toBeNull();
    expect(input).toHaveValue("Please keep this private unsent draft.");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // Closing/reopening preserves the same target's tab draft; nothing is submitted.
    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));
    expect(screen.getByRole("textbox")).toHaveValue(
        "Please keep this private unsent draft.",
    );
    expect(feedbackRequest).not.toHaveBeenCalled();
});

test("compact selection cues retain admin-only export privacy text without a visible instruction panel", () => {
    render(
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
    fireEvent.keyDown(window, { key: "?" });
    const toolbar = screen.getByRole("toolbar", {
        name: "Choose a part of the page",
    });
    expect(toolbar.querySelector("p")).toBeNull();
    expect(
        screen.getByRole("button", { name: "Copy prompt" }),
    ).toHaveAccessibleDescription(
        /Photo IDs are included; image files and signed URLs are not/,
    );
    expect(
        screen.getByRole("link", { name: "Comments & changes" }),
    ).toHaveAttribute("href", "/dashboard/changes");
});

test("a landscape phone uses its full visible area while a roomy desktop stays centered", () => {
    Object.assign(viewport, { width: 844, height: 390 });
    render(<ContextualFeedback />);
    open();
    const dialog = screen.getByRole("dialog", { name: "Add a comment" });
    expect(dialog).toHaveStyle({
        left: "0px",
        top: "0px",
        width: "844px",
        height: "390px",
        transform: "none",
    });
    act(() => {
        Object.assign(viewport, { width: 1280, height: 800 });
        viewport.dispatchEvent(new Event("resize"));
    });
    expect(dialog).toHaveStyle({
        left: "640px",
        top: "400px",
        width: "560px",
        height: "700px",
    });
    expect(dialog).not.toHaveAttribute("data-full-viewport");
});

test("a nested private attachment dialog takes focus and returns it to the composer without submitting", async () => {
    const user = userEvent.setup();
    render(
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
    open();
    const input = screen.getByRole("textbox");
    await user.type(input, "Unsent attachment draft");
    const trigger = screen.getByRole("button", { name: "Admin photo" });
    await user.click(trigger);
    const attachment = screen.getByRole("alertdialog", {
        name: "Private photo",
    });
    await waitFor(() =>
        expect(attachment).toContainElement(
            document.activeElement as HTMLElement,
        ),
    );
    expect(screen.queryByRole("dialog", { name: "Add a comment" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel attachment" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole("textbox")).toHaveValue("Unsent attachment draft");
    expect(feedbackRequest).not.toHaveBeenCalled();
});
