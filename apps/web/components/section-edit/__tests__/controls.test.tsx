import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SectionControls } from "../controls";
import { page, removedPage, removal } from "./fixtures";

beforeEach(() => {
    document.body.innerHTML = `<div data-feedback-page="home"><header data-feedback-id="shared">Shared</header><div class="min-h-screen"><div data-feedback-widget="hero">Welcome</div><div data-feedback-widget="body">Our story</div></div></div>`;
});

test("only eligible authored sections get visible pointer controls and callbacks", () => {
    const onRemove = jest.fn();
    const { unmount } = render(
        <SectionControls
            enabled
            page={page}
            pending={{ kind: "idle" }}
            onRemove={onRemove}
            onRestore={jest.fn()}
        />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    fireEvent.click(
        screen.getByRole("button", { name: "Remove Welcome section" }),
    );
    expect(onRemove).toHaveBeenCalledWith(page.sections[0]);
    unmount();
    expect(document.querySelectorAll("[data-kk-section-slot]")).toHaveLength(0);
});

test("pending removal hides immediately, saved Undo survives server rendering and retains focus", async () => {
    const onRestore = jest.fn();
    const props = {
        enabled: true,
        page,
        pending: { kind: "idle" as const },
        onRemove: jest.fn(),
        onRestore,
    };
    const { rerender } = render(<SectionControls {...props} />);
    fireEvent.click(
        screen.getByRole("button", { name: "Remove Welcome section" }),
    );
    rerender(
        <SectionControls
            {...props}
            pending={{ kind: "saving", widgetId: "hero", action: "remove" }}
        />,
    );
    expect(
        document.querySelector('[data-feedback-widget="hero"]'),
    ).toHaveAttribute("data-kk-section-removed");
    expect(screen.getByRole("button", { name: "Removing…" })).toBeDisabled();
    document.querySelector('[data-feedback-widget="hero"]')!.remove();
    rerender(<SectionControls {...props} page={removedPage} />);
    const undo = await screen.findByRole("button", { name: /Undo removal/ });
    expect(undo).toHaveAttribute("aria-keyshortcuts", "Enter");
    expect(undo).toHaveTextContent("↵");
    expect(undo).not.toHaveTextContent("⌘Z");
    expect(undo).toHaveFocus();
    expect(
        undo.closest("[data-kk-section-slot]")?.nextElementSibling,
    ).toHaveAttribute("data-kk-section-slot", "body");
    fireEvent.click(undo);
    expect(onRestore).toHaveBeenCalledWith(removal);
});

test("React reconciliation can remove and restore the authored section without losing its portal", async () => {
    const Tree = ({ present }: { present: boolean }) => (
        <div data-feedback-page="home">
            <div className="min-h-screen">
                {present && (
                    <div key="hero" data-feedback-widget="hero">
                        Welcome
                    </div>
                )}
                <div key="body" data-feedback-widget="body">
                    Our story
                </div>
            </div>
        </div>
    );
    document.body.innerHTML = "";
    const content = render(<Tree present />);
    const ui = render(
        <SectionControls
            enabled
            page={removedPage}
            pending={{ kind: "idle" }}
            onRemove={jest.fn()}
            onRestore={jest.fn()}
        />,
    );
    content.rerender(<Tree present={false} />);
    await waitFor(() =>
        expect(
            screen.getByRole("button", { name: /Undo removal/ }),
        ).toBeInTheDocument(),
    );
    content.rerender(<Tree present />);
    ui.rerender(
        <SectionControls
            enabled
            page={page}
            pending={{ kind: "idle" }}
            onRemove={jest.fn()}
            onRestore={jest.fn()}
        />,
    );
    await waitFor(() =>
        expect(
            screen.getByRole("button", { name: "Remove Welcome section" }),
        ).toBeInTheDocument(),
    );
    expect(
        document.querySelector('[data-feedback-widget="hero"]'),
    ).not.toHaveAttribute("data-kk-section-removed");
    ui.unmount();
    content.unmount();
});

test("Done removes admin placeholders and controls, leaving public content alone", () => {
    const props = {
        page: removedPage,
        pending: { kind: "idle" as const },
        onRemove: jest.fn(),
        onRestore: jest.fn(),
    };
    const { rerender } = render(<SectionControls enabled {...props} />);
    rerender(<SectionControls enabled={false} {...props} />);
    expect(document.querySelectorAll("[data-kk-section-slot]")).toHaveLength(0);
    expect(screen.queryByRole("button")).toBeNull();
});
