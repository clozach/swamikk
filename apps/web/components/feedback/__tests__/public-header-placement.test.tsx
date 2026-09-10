import React from "react";
import { render, screen } from "@testing-library/react";
import Template from "@components/public/base-layout/template";
import WidgetByName from "@components/public/base-layout/template/widget-by-name";
import type { State } from "@courselit/common-models";
import { defaultState } from "@components/default-state";
import {
    FeedbackControlPlacement,
    FeedbackControlSlot,
    FeedbackPlacementProvider,
} from "../placement";

jest.mock("next-themes", () => ({
    useTheme: () => ({ resolvedTheme: "light", setTheme: jest.fn() }),
}));
jest.mock("@/lib/theme-styles", () => ({ generateThemeStyles: () => "" }));
jest.mock("@courselit/components-library", () => ({
    useMediaLit: () => ({ uploadFile: jest.fn(), isUploading: false }),
    Toaster: () => null,
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@courselit/page-blocks", () => ({
    Footer: { metadata: { name: "footer" } },
}));
jest.mock(
    "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/account-control",
    () =>
        function AccountControl() {
            return <span>Account</span>;
        },
);
jest.mock(
    "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/mobile-overlay",
    () => () => null,
);
jest.mock("@/ui-config/widgets", () => ({
    anahataHeader: {
        metadata: { role: "header" },
        widget: jest.requireActual(
            "../../../../../packages/page-blocks/src/blocks/anahata-header/widget",
        ).default,
    },
    fullText: {
        widget: ({
            headerUtilities,
        }: {
            headerUtilities?: React.ReactNode;
        }) => <section>Page body{headerUtilities}</section>,
    },
}));

const layout = [
    {
        widgetId: "header",
        name: "anahataHeader",
        settings: { sticky: false, showTopBar: false, menu: [] },
    },
    { widgetId: "body", name: "fullText", settings: {} },
];

test("public checkout has one viewport control outside the masthead and payment content", () => {
    const { container } = render(
        <FeedbackPlacementProvider>
            <FeedbackControlPlacement>
                <button>Comment</button>
            </FeedbackControlPlacement>
            <Template
                layout={layout}
                pageData={{}}
                state={defaultState as unknown as State}
                headerUtilities={<FeedbackControlSlot />}
            >
                <main>
                    Checkout <button>Pay</button>
                </main>
            </Template>
        </FeedbackPlacementProvider>,
    );
    const button = screen.getByRole("button", { name: "Comment" });
    expect(screen.getAllByRole("button", { name: "Comment" })).toHaveLength(1);
    expect(button.closest("header")).toBeNull();
    expect(button.closest(".kk-feedback-corner")).not.toBeNull();
    for (let node = button.parentElement; node; node = node.parentElement) {
        expect(node.className).not.toMatch(
            /(?:max-\[767px\]:hidden|md:hidden|hidden)/,
        );
    }
    expect(container.querySelector("section .kk-feedback-slot")).toBeNull();
    expect(container.querySelector(".kk-feedback-fallback")).toBeNull();
});

test("editor previews and legacy header utilities cannot duplicate or capture the control", () => {
    const { container } = render(
        <FeedbackPlacementProvider>
            <FeedbackControlPlacement>
                <button>Comment</button>
            </FeedbackControlPlacement>
            <header aria-label="Editor toolbar" className="fixed">
                <FeedbackControlSlot />
            </header>
            <Template
                editing
                layout={layout}
                pageData={{}}
                state={defaultState as unknown as State}
                headerUtilities={<FeedbackControlSlot />}
            />
        </FeedbackPlacementProvider>,
    );
    expect(container.querySelectorAll(".kk-feedback-slot")).toHaveLength(0);
    expect(
        screen
            .getByRole("button", { name: "Comment" })
            .closest(".kk-feedback-corner"),
    ).not.toBeNull();
});

test("standalone previews do not alter the shellless viewport control", () => {
    const { container } = render(
        <FeedbackPlacementProvider>
            <FeedbackControlPlacement>
                <button>Comment</button>
            </FeedbackControlPlacement>
            <WidgetByName
                name="anahataHeader"
                id="preview"
                settings={{ type: "site", verticalPadding: "py-4" }}
                pageData={{ pageType: "site" }}
                state={defaultState as unknown as State}
                editing={false}
            />
        </FeedbackPlacementProvider>,
    );
    expect(container.querySelector(".kk-feedback-slot")).toBeNull();
    expect(
        screen
            .getByRole("button", { name: "Comment" })
            .closest(".kk-feedback-corner"),
    ).not.toBeNull();
});
