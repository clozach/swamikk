import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    Sidebar,
    SidebarContent,
    SidebarProvider,
    SidebarTrigger,
    useSidebar,
} from "../sidebar";

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

function Contents() {
    const { setOpenMobile } = useSidebar();
    return (
        <Sidebar>
            <SidebarContent>
                <button>First menu action</button>
                <button
                    onClick={() => {
                        window.history.pushState({}, "", "/destination");
                        setOpenMobile(false);
                    }}
                >
                    Navigate
                </button>
            </SidebarContent>
        </Sidebar>
    );
}

function Menu({ disabled = false, showOpener = true }) {
    return (
        <SidebarProvider>
            {showOpener && <SidebarTrigger disabled={disabled} />}
            <Contents />
            <main tabIndex={-1}>Destination content</main>
        </SidebarProvider>
    );
}

beforeEach(() => window.history.replaceState({}, "", "/origin"));

test("keyboard Escape returns focus to the actual opening toggle", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    const opener = screen.getByRole("button", { name: "Toggle Sidebar" });
    opener.focus();
    await user.keyboard("{Enter}{Tab}{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
});

test("with two controls, dismissal returns to the one that opened the menu", async () => {
    const user = userEvent.setup();
    render(
        <SidebarProvider>
            <SidebarTrigger aria-label="First navigation control" />
            <SidebarTrigger aria-label="Second navigation control" />
            <Contents />
        </SidebarProvider>,
    );
    const opener = screen.getByRole("button", {
        name: "Second navigation control",
    });
    await user.click(opener);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
});

test("dismissing the overlay returns focus to the opening toggle", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    const opener = screen.getByRole("button", { name: "Toggle Sidebar" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Radix observes pointer-down outside the content, as a backdrop tap does.
    fireEvent.pointerDown(document.body, {
        pointerType: "mouse",
        button: 0,
        ctrlKey: false,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
});

test("route navigation does not move focus back to the old toggle", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    const opener = screen.getByRole("button", { name: "Toggle Sidebar" });
    await user.click(opener);
    const focus = jest.spyOn(opener, "focus");
    await user.click(screen.getByRole("button", { name: "Navigate" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.pathname).toBe("/destination");
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
});

test.each(["removed", "disabled"])(
    "does not focus an opener that became %s",
    async (condition) => {
        const user = userEvent.setup();
        const { rerender } = render(<Menu />);
        const opener = screen.getByRole("button", { name: "Toggle Sidebar" });
        await user.click(opener);
        const focus = jest.spyOn(opener, "focus");
        rerender(
            <Menu
                showOpener={condition !== "removed"}
                disabled={condition === "disabled"}
            />,
        );
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(focus).not.toHaveBeenCalled();
        focus.mockRestore();
    },
);
