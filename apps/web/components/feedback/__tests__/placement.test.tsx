import React, { useEffect, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ContextualFeedback from "..";
import { FeedbackControlSlot, FeedbackPlacementProvider } from "../placement";
import { ProfileContext } from "@components/contexts";
import {
    HideDuringMimic,
    MemberMimicContext,
} from "@components/member-mimic/context";
import type { Profile } from "@courselit/common-models";

let mockPath = "/course/practice";
jest.mock("next/navigation", () => ({ usePathname: () => mockPath }));
jest.mock("next/dynamic", () => () => () => null);

function Fixture({
    header = true,
    userId = "member",
    permissions = [],
}: {
    header?: boolean;
    userId?: string;
    permissions?: string[];
}) {
    return (
        <ProfileContext.Provider
            value={{
                profile: { userId, permissions } as Partial<Profile>,
                setProfile: jest.fn(),
            }}
        >
            <FeedbackPlacementProvider>
                <HideDuringMimic>
                    <ContextualFeedback />
                </HideDuringMimic>
                {header && (
                    <header aria-label="Course header">
                        <FeedbackControlSlot />
                    </header>
                )}
                <main>
                    <h1>Practice</h1>
                    <a href="/next">Next lesson</a>
                </main>
            </FeedbackPlacementProvider>
        </ProfileContext.Provider>
    );
}

beforeEach(() => {
    mockPath = "/course/practice";
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as typeof ResizeObserver;
});

test("one compact control lives in the header; the closed fixed dock has no controls", () => {
    const { container } = render(<Fixture />);
    expect(
        screen.getAllByRole("button", { name: "Comment on this page" }),
    ).toHaveLength(1);
    expect(
        within(screen.getByRole("banner")).getByRole("button", {
            name: "Comment on this page",
        }),
    ).toBeInTheDocument();
    expect(container.querySelector(".kk-feedback-tools button")).toBeNull();
    expect(container.querySelector(".kk-feedback-fallback")).toBeNull();
    fireEvent.click(
        screen.getByRole("button", { name: "Comment on this page" }),
    );
    expect(
        screen.getByRole("button", { name: "Close Esc" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".kk-feedback-tools button")).toBeNull();
});

test("closure and route transitions remove the old slot and preserve a working page-flow fallback", () => {
    const { rerender, container } = render(<Fixture />);
    fireEvent.keyDown(window, { key: "?" });
    expect(
        screen.getByRole("button", { name: "Close Esc" }),
    ).toBeInTheDocument();
    mockPath = "/dashboard/profile";
    rerender(<Fixture header={false} userId="" />);
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close Esc" })).toBeNull();
    expect(
        within(
            container.querySelector(".kk-feedback-fallback") as HTMLElement,
        ).getByRole("button", { name: "Comment on this page" }),
    ).toBeInTheDocument();
    fireEvent.click(
        screen.getByRole("button", { name: "Comment on this page" }),
    );
    expect(
        screen.getByRole("button", { name: "Close Esc" }),
    ).toBeInTheDocument();
    rerender(<Fixture />);
    expect(container.querySelector(".kk-feedback-fallback")).toBeNull();
    expect(
        screen.getAllByRole("button", { name: "Comment on this page" }),
    ).toHaveLength(1);
});

test("slot registration does not remount unrelated page state", () => {
    const mounts = jest.fn();
    function Content() {
        const [header, setHeader] = useState(false);
        useEffect(() => {
            mounts();
        }, []);
        return (
            <>
                <input aria-label="Unsent material" defaultValue="Kept" />
                <button onClick={() => setHeader(!header)}>Change shell</button>
                {header && (
                    <header>
                        <FeedbackControlSlot />
                    </header>
                )}
            </>
        );
    }
    render(
        <FeedbackPlacementProvider>
            <ContextualFeedback />
            <Content />
        </FeedbackPlacementProvider>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Still here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change shell" }));
    fireEvent.click(screen.getByRole("button", { name: "Change shell" }));
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox")).toHaveValue("Still here");
});

test("Mimic leaves no phantom header slot or public feedback controls", () => {
    const { container } = render(
        <MemberMimicContext.Provider
            value={{ kind: "expired", returnTo: "/dashboard/users" }}
        >
            <Fixture />
        </MemberMimicContext.Provider>,
    );
    expect(container.querySelector(".kk-feedback-slot")).toBeNull();
    expect(
        screen.queryByRole("button", { name: "Comment on this page" }),
    ).toBeNull();
});

test.each([{ permissions: [] }, { permissions: ["site:manage"] }])(
    "header placement preserves admin-only Copy prompt (%j)",
    ({ permissions }) => {
        render(<Fixture permissions={permissions} />);
        fireEvent.keyDown(window, { key: "?" });
        const copy = screen.queryByRole("button", { name: "Copy page prompt" });
        expect(Boolean(copy)).toBe(permissions.length > 0);
    },
);
