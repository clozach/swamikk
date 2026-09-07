import { render, screen } from "@testing-library/react";
import PageProposalPreview from "../page-proposal-preview";
import WidgetByName from "@/components/public/base-layout/template/widget-by-name";
import { defaultState } from "@/components/default-state";

jest.mock("color-convert", () => ({
    __esModule: true,
    default: { hex: { hsl: () => [0, 0, 0] } },
}));

jest.mock("@/components/public/base-layout/template/widget-by-name", () => ({
    __esModule: true,
    default: jest.fn((props) => (
        <div>
            <p>{props.settings.heading}</p>
            <button>Native navigation</button>
        </div>
    )),
}));
test("native preview receives frozen defaults, scopes its theme and holds fallback rotation still", () => {
    const snapshot = (image: string) => ({
        kind: "page-widget",
        widget: {
            widgetId: "hero",
            name: "anahataHero",
            settings: { bannerMode: { kind: "social-rotation" } },
        },
        renderSettings: {
            heading: "Frozen welcome",
            bannerImage: {
                source: { kind: "url", url: image },
                alt: "Reviewed image",
            },
            bannerMode: { kind: "social-rotation" },
        },
        defaultDerived: true,
        rotatingFallback: true,
    });
    const change = {
        preview: {
            before: snapshot("/before.jpg"),
            after: snapshot("/after.jpg"),
        },
        baseline: {
            theme: defaultState.theme,
            typefaces: [],
            pageType: "site",
            draft: "mirrored-leaf",
        },
    } as any;
    const { container } = render(<PageProposalPreview change={change} />);
    expect(screen.getAllByText("Frozen welcome")).toHaveLength(2);
    expect(
        screen.getByText(/Social photo rotation will continue/),
    ).toBeInTheDocument();
    expect(
        screen.getByText(/all other unpublished work stays unpublished/),
    ).toBeInTheDocument();
    const calls = jest.mocked(WidgetByName).mock.calls;
    expect(calls.map(([props]) => (props.settings as any).bannerMode)).toEqual([
        { kind: "static" },
        { kind: "static" },
    ]);
    expect(((calls[1][0].settings as any).bannerImage as any).source.url).toBe(
        "/after.jpg",
    );
    for (const button of Array.from(container.querySelectorAll("button")))
        expect(button.closest("[inert]")).not.toBeNull();
    for (const style of Array.from(container.querySelectorAll("style"))) {
        expect(style.textContent).toContain(".page-preview-");
        expect(style.textContent).not.toContain(".courselit-theme");
    }
    expect(change.preview.after.widget.settings.bannerMode.kind).toBe(
        "social-rotation",
    );
});
