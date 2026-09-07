import { render, screen } from "@testing-library/react";
import ContextualFeedback from "../index";
import { ProfileContext } from "@/components/contexts";
import { MemberMimicContext } from "@/components/member-mimic/context";

jest.mock("next/navigation", () => ({ usePathname: () => "/" }));
jest.mock(
    "next/dynamic",
    () => () =>
        function MockEditor() {
            return <div>Editor loaded</div>;
        },
);
jest.mock("../use-selection", () => ({
    useSelection: () => ({
        mode: { kind: "selected" },
        setMode: jest.fn(),
        rect: null,
        selected: {
            label: "Welcome",
            authorTarget: { pageId: "home", widgetId: "hero" },
        },
    }),
}));
jest.mock("@/components/ui/dialog", () => ({
    Dialog: () => null,
    DialogContent: () => null,
    DialogTitle: () => null,
    DialogDescription: () => null,
}));
beforeEach(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as typeof ResizeObserver;
});

test.each([
    [[], "inactive", false],
    [["course:manage_any"], "inactive", false],
    [["site:manage"], "inactive", true],
    [["site:manage"], "active", false],
    [["site:manage"], "expired", false],
])(
    "page editor requires site permission outside Mimic (%j, %s)",
    (permissions, kind, visible) => {
        render(
            <ProfileContext.Provider
                value={
                    {
                        profile: { userId: "actor", permissions },
                        setProfile: jest.fn(),
                    } as any
                }
            >
                <MemberMimicContext.Provider value={{ kind } as any}>
                    <ContextualFeedback />
                </MemberMimicContext.Provider>
            </ProfileContext.Provider>,
        );
        expect(
            !!screen.queryByRole("button", {
                name: "Edit selected text or image",
            }),
        ).toBe(visible);
        if (kind !== "inactive")
            expect(
                screen.queryByRole("button", { name: "Copy prompt" }),
            ).not.toBeInTheDocument();
    },
);
