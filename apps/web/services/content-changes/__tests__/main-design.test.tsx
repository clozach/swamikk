import React from "react";
import { fireEvent, render } from "@testing-library/react";
import type { WidgetInstance } from "@courselit/common-models";
import Header from "../../../../../packages/page-blocks/src/blocks/anahata-header/widget";
import Hero from "../../../../../packages/page-blocks/src/blocks/anahata-hero/widget";
import Tour from "../../../../../packages/page-blocks/src/blocks/anahata-tour/widget";
import PrivateSessions from "../../../../../packages/page-blocks/src/blocks/anahata-private-sessions/widget";
import Gatherings from "../../../../../packages/page-blocks/src/blocks/anahata-gatherings/widget";
import Newsletter from "../../../../../packages/page-blocks/src/blocks/anahata-newsletter/widget";
import Posts from "../../../../../packages/page-blocks/src/blocks/anahata-posts/widget";
import Footer from "../../../../../packages/page-blocks/src/blocks/anahata-footer/widget";
import { pageWidgetFields, pagePreviewSettings } from "../page-registry";
import { PALETTE } from "../../../../../packages/page-blocks/src/components/palette";
import { widgetImageLeaves } from "../image-registry";
import { widgetTextLeaves } from "../text-leaves";
import { indexLeaves } from "../../../components/feedback/text-edit/leaves";
import { findRuns } from "../../../components/feedback/text-edit/runs";

jest.mock("@courselit/components-library", () => ({
    ...jest.requireActual(
        "../../../../../packages/components-library/src/external-link",
    ),
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
    Link: ({ children, href, className }: any) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
    ResponsiveImage: ({ src, alt, sizes, objectFit }: any) => (
        <img
            src={src}
            alt={alt}
            sizes={sizes}
            data-responsive="true"
            style={{ objectFit }}
        />
    ),
    Image: ({ src, media, alt }: any) => (
        <img src={src || media?.file || media?.thumbnail} alt={alt || ""} />
    ),
}));
jest.mock("@courselit/page-primitives", () => ({
    Section: ({ children, background, className, style, id }: any) => (
        <section
            id={id}
            className={className}
            style={style}
            data-background={JSON.stringify(background)}
        >
            {children}
        </section>
    ),
}));
jest.mock("@courselit/utils", () => ({ FetchBuilder: jest.fn() }));
jest.mock(
    "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/account-control",
    () => ({
        __esModule: true,
        default: () => null,
        MobileAccountSection: jest.requireActual(
            "../../../../../packages/page-blocks/src/blocks/anahata-header/widget/account-control",
        ).MobileAccountSection,
    }),
);
jest.mock(
    "../../../../../packages/page-blocks/node_modules/next/navigation",
    () => ({ useRouter: () => ({ refresh: jest.fn() }) }),
);
jest.mock(
    "../../../../../packages/page-blocks/src/blocks/anahata-hero/use-image-scroll",
    () => ({ useImageScroll: () => {} }),
);
jest.mock(
    "../../../../../packages/page-blocks/src/blocks/anahata-hero/use-social-rotation",
    () => ({ useSocialRotation: () => ({ ready: false }) }),
);

const state = {
    theme: {
        theme: {
            structure: {
                page: { width: "max-w-6xl" },
                section: { padding: { y: "py-8" } },
            },
        },
    },
    address: "https://site.example",
    profile: null,
} as any;
const paint = (
    Widget: React.ComponentType<any>,
    settings: Record<string, unknown> = {},
    nextTheme: "light" | "dark" = "light",
) =>
    render(
        <Widget
            id="main-design"
            settings={settings}
            state={state}
            nextTheme={nextTheme}
            editing={false}
        />,
    );

beforeEach(() => {
    window.matchMedia = jest.fn(() => ({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    })) as any;
    global.ResizeObserver = class {
        observe() {}
        disconnect() {}
        unobserve() {}
    } as any;
});

describe("main-site defaults use the resumed Clay & Saffron wireframe", () => {
    it.each([
        ["header", Header, 1],
        ["hero", Hero, 2],
        ["tour", Tour, 0],
        ["private sessions", PrivateSessions, 1],
        ["gatherings", Gatherings, 1],
        ["newsletter", Newsletter, 0],
        ["posts", Posts, 6],
        ["footer", Footer, 1],
    ] as const)(
        "%s keeps unfinished image wells and the non-green palette",
        (_name, Widget, wells) => {
            const { container } = paint(Widget);
            expect(
                container.querySelectorAll('[data-asset="waiting"]'),
            ).toHaveLength(wells);
            expect(container.innerHTML).not.toMatch(
                /#(?:0f1a15|1b2d24|1f3d2b)|rgb\(15, 26, 21\)|rgb\(27, 45, 36\)/i,
            );
            expect(container.innerHTML).not.toMatch(
                /\/anahata\/(hp-hero-bg|footer-callout-bg|post-kumara-salad|footer-logo-2021)/,
            );
        },
    );

    it("keeps the shared hero frame and all six post slots ready for replacement", () => {
        const hero = paint(Hero);
        expect(
            hero.container.querySelectorAll('[data-asset="waiting"]'),
        ).toHaveLength(2);
        const posts = paint(Posts);
        expect(
            Array.from(
                posts.container.querySelectorAll("[data-kk-image-path]"),
            ).map((node) => node.getAttribute("data-kk-image-path")),
        ).toEqual(
            Array.from(
                { length: 6 },
                (_, index) => `posts.${index}.thumbnail.source`,
            ),
        );
        expect(posts.container.querySelectorAll("img")).toHaveLength(0);
    });
});

const contact = {
    kind: "contact",
    id: "contact",
    title: "",
    logoAlt: "Saved mark",
    logoWidth: 150,
    logoHeight: 168,
    heading: "",
    addressLines: [],
    socials: [],
};
const event = {
    id: "event",
    title: "Saved event",
    href: "/event",
    imageAlt: "Saved photo",
    hostLine: "",
    dateRange: "",
    excerpt: "",
};
const post = { id: "post", title: "Saved post", date: "", href: "/post" };

describe.each([
    ["URL", { kind: "url", url: "/saved-photo.jpg" }],
    [
        "media",
        {
            kind: "media",
            media: {
                file: "/saved-photo.jpg",
                thumbnail: "/smaller-photo.jpg",
            },
        },
    ],
    [
        "explicit placeholder",
        { kind: "placeholder", description: "Author's unfinished image" },
    ],
] as const)(
    "saved %s images survive the wireframe baseline",
    (_kind, source) => {
        it.each([
            ["hero", Hero, { bannerImage: { source, alt: "Saved photo" } }],
            ["header", Header, { logoSource: source }],
            [
                "footer",
                Footer,
                { columns: [{ ...contact, logoSource: source }] },
            ],
            ["private sessions", PrivateSessions, { photo: source }],
            [
                "gatherings",
                Gatherings,
                { events: [{ ...event, image: source }] },
            ],
            [
                "posts",
                Posts,
                {
                    posts: [
                        { ...post, thumbnail: { source, alt: "Saved photo" } },
                    ],
                },
            ],
        ] as const)(
            "%s reads the image shape its current editor writes",
            (_name, Widget, settings) => {
                const before = JSON.stringify(settings);
                const { container } = paint(Widget, settings);
                if (source.kind === "placeholder") {
                    const well = container.querySelector(
                        '[data-asset="waiting"]',
                    );
                    expect(well).toHaveAttribute(
                        "aria-label",
                        source.description,
                    );
                    expect(well).toHaveTextContent(source.description);
                } else
                    expect(container.innerHTML).toContain("/saved-photo.jpg");
                expect(JSON.stringify(settings)).toBe(before);
            },
        );
    },
);

it.each([
    ["header URL", Header, { logoSrc: "/legacy-photo.jpg" }],
    [
        "header media precedence",
        Header,
        { logoSrc: "/unused.jpg", logoMedia: { file: "/legacy-photo.jpg" } },
    ],
    [
        "footer",
        Footer,
        { columns: [{ ...contact, logoUrl: "/legacy-photo.jpg" }] },
    ],
    [
        "gatherings",
        Gatherings,
        { events: [{ ...event, imageUrl: "/legacy-photo.jpg" }] },
    ],
    [
        "post URL",
        Posts,
        {
            posts: [
                {
                    ...post,
                    thumbnail: { kind: "url", url: "/legacy-photo.jpg" },
                },
            ],
        },
    ],
    [
        "post media",
        Posts,
        {
            posts: [
                {
                    ...post,
                    thumbnail: {
                        kind: "media",
                        media: { file: "/legacy-photo.jpg" },
                    },
                },
            ],
        },
    ],
] as const)(
    "keeps the previously stored %s form readable",
    (_name, Widget, settings) => {
        expect(paint(Widget, settings).container.innerHTML).toContain(
            "/legacy-photo.jpg",
        );
    },
);

it("lists the actual default image and text values seen by the native editor", () => {
    const widget = {
        name: "anahataHero",
        widgetId: "hero",
        deleteable: true,
        shared: false,
        settings: {},
    } as WidgetInstance;
    const fields = pageWidgetFields(widget);
    const preview = pagePreviewSettings(widget);
    const banner = fields.find((field) => field.field === "bannerImage")!;
    expect(banner).toMatchObject({
        defaultDerived: true,
        value: { source: { kind: "placeholder" } },
    });
    expect(banner.placeholder?.description).toBeTruthy();
    for (const field of fields.filter(
        (field) => !field.field.startsWith("paragraph:"),
    ))
        expect(preview[field.field]).toEqual(field.value);
    const { container } = paint(Hero, preview);
    expect(container.innerHTML).toContain("waiting for asset");
    expect(container.textContent).toContain(
        String(fields.find((field) => field.field === "heading")!.value),
    );
});

it("keeps explicit placeholders intact in native records and previews", () => {
    const settings = {
        bannerImage: {
            source: {
                kind: "placeholder",
                description: "Author's unfinished image",
            },
            alt: "",
        },
    };
    const before = JSON.stringify(settings);
    const widget = {
        name: "anahataHero",
        widgetId: "hero",
        deleteable: true,
        shared: false,
        settings,
    } as WidgetInstance;
    const banner = pageWidgetFields(widget).find(
        (field) => field.field === "bannerImage",
    )!;
    expect(banner.value).toEqual(settings.bannerImage);
    expect(banner.defaultDerived).toBe(false);
    expect(pagePreviewSettings(widget).bannerImage).toEqual(
        settings.bannerImage,
    );
    paint(Hero, settings);
    expect(JSON.stringify(settings)).toBe(before);
});

describe("native text targets match the resumed Posts renderer", () => {
    beforeEach(() => {
        // jsdom has no layout; expose the real rendered text to the matcher.
        jest.spyOn(Element.prototype, "getClientRects").mockReturnValue([
            {},
        ] as unknown as DOMRectList);
    });
    afterEach(() => jest.restoreAllMocks());

    const targetsFor = (settings: Record<string, unknown>) => {
        const PostWidget: React.ComponentType<any> = Posts;
        const widget: WidgetInstance = {
            widgetId: "main-design",
            name: "anahataPosts",
            deleteable: true,
            shared: false,
            settings,
        };
        const leaves = widgetTextLeaves(widget);
        const index = indexLeaves({
            pageId: "home",
            revision: 0,
            widgets: [{ ...widget, leaves }],
        });
        const { container } = render(
            <div data-feedback-id="main-design">
                <PostWidget
                    id="main-design"
                    settings={settings}
                    state={state}
                    nextTheme="light"
                    editing={false}
                />
            </div>,
        );
        return { ...findRuns(container, index), leaves, container };
    };

    it.each([
        ["omitted settings", {}, "Read the blog", "moreLink.label"],
        [
            "legacy button pair",
            { buttonCaption: "Browse stories", buttonAction: "/stories" },
            "Browse stories",
            "buttonCaption",
        ],
        [
            "current link",
            { moreLink: { label: "Browse stories", href: "/stories" } },
            "Browse stories",
            "moreLink.label",
        ],
        [
            "current link with matching hidden legacy copy",
            {
                moreLink: { label: "Browse stories", href: "/stories" },
                buttonCaption: "Browse stories",
                buttonAction: "/old-stories",
            },
            "Browse stories",
            "moreLink.label",
        ],
    ])("binds the CTA once with %s", (_, settings, label, path) => {
        const { runs, ambiguous, leaves } = targetsFor(
            settings as Record<string, unknown>,
        );
        expect(leaves.filter((leaf) => leaf.value === label)).toHaveLength(1);
        const matches = runs.filter((run) => run.path === path);
        expect(matches).toHaveLength(1);
        expect(matches[0].element.textContent).toBe(label);
        expect(ambiguous.map((element) => element.textContent)).not.toContain(
            label,
        );
    });

    it("leaves repeated visible dates ambiguous and preserves stored values", () => {
        const settings = {
            posts: [
                {
                    ...post,
                    id: "first",
                    title: "First story",
                    date: "May 1, 2026",
                },
                {
                    ...post,
                    id: "second",
                    title: "Second story",
                    date: "May 1, 2026",
                },
            ],
        };
        const before = JSON.stringify(settings);
        const { runs, ambiguous, leaves } = targetsFor(settings);
        expect(
            leaves.filter((leaf) => leaf.value === "May 1, 2026"),
        ).toHaveLength(2);
        expect(runs.filter((run) => run.path.endsWith(".date"))).toHaveLength(
            0,
        );
        expect(
            ambiguous.filter(
                (element) => element.textContent === "May 1, 2026",
            ),
        ).toHaveLength(2);
        expect(JSON.stringify(settings)).toBe(before);
    });
});

it("excludes image and logo alternative text from editable prose", () => {
    for (const [name, settings] of [
        ["anahataHeader", { logoAlt: "Logo description" }],
        [
            "anahataGatherings",
            { events: [{ ...event, imageAlt: "Image description" }] },
        ],
        [
            "anahataFooter",
            { columns: [{ ...contact, logoAlt: "Logo description" }] },
        ],
    ] as const) {
        const leaves = widgetTextLeaves({
            widgetId: "main-design",
            name,
            deleteable: true,
            shared: false,
            settings,
        });
        expect(
            leaves.some((leaf) =>
                /(?:^|\.)(?:alt|imageAlt|logoAlt)$/.test(leaf.path),
            ),
        ).toBe(false);
        expect(
            leaves.some((leaf) =>
                /^(Logo|Image) description$/.test(leaf.value),
            ),
        ).toBe(false);
    }
});

it("keeps Menu and Contact legible in the dark header", () => {
    const view = paint(Header, {}, "dark");
    const menu = view.getByRole("button", { name: "Menu" });
    const contactLink = menu.parentElement!.querySelector("a")!;
    expect(contactLink.textContent).toBe("Contact");
    for (const control of [menu, contactLink]) {
        expect(control.classList).toContain("text-[var(--nav-fg)]");
        expect(control.classList).toContain("hover:text-[var(--nav-fg-hover)]");
        const band = control.closest<HTMLElement>('[style*="--nav-fg:"]')!;
        expect(band.style.getPropertyValue("--nav-fg")).toBe(PALETTE.bone);
        expect(band.style.getPropertyValue("--nav-fg-hover")).toBe(
            PALETTE.mossLight,
        );
    }
});

it.each(["light", "dark"] as const)(
    "gives drawer logout its own focus color in %s mode",
    (nextTheme) => {
        const view = render(
            <Header
                id="main-design"
                name="anahataHeader"
                pageData={{} as any}
                toggleTheme={() => {}}
                settings={{} as any}
                state={{
                    ...state,
                    profile: { name: "Member", email: "member@example.test" },
                }}
                nextTheme={nextTheme}
                editing={false}
            />,
        );
        fireEvent.click(view.getByRole("button", { name: "Menu" }));
        const drawer = view.getByRole("dialog", { name: "Site menu" });
        const logout = view.getByRole("button", { name: "Logout" });
        expect(drawer.contains(logout)).toBe(true);
        expect(logout.classList).toContain(
            "focus-visible:outline-[var(--nav-fg-hover)]",
        );
        // The header band and drawer are siblings. Only the drawer and its
        // ancestors can supply this CSS variable to the actual Logout button.
        const supplier = logout.closest<HTMLElement>(
            '[style*="--nav-fg-hover:"]',
        );
        expect(supplier).toBe(drawer);
        expect(
            window.getComputedStyle(drawer).getPropertyValue("--nav-fg-hover"),
        ).toBe(PALETTE.mossLight);
        expect(window.getComputedStyle(drawer).backgroundColor).toBe(
            "rgb(47, 33, 24)",
        );
    },
);

it.each([
    ["anahataHeader", Header],
    ["anahataGatherings", Gatherings],
    ["anahataPosts", Posts],
    ["anahataPrivateSessions", PrivateSessions],
    ["anahataFooter", Footer],
] as const)(
    "%s visible picture markers resolve to the server's explicit image registry",
    (name, Widget) => {
        const { container } = paint(Widget);
        const registered = new Set(
            widgetImageLeaves({
                name,
                widgetId: "main-design",
                settings: {},
                deleteable: true,
                shared: false,
            }).map((image) => image.path),
        );
        const marked = Array.from(
            container.querySelectorAll("[data-kk-image-path]"),
        );
        expect(marked.length).toBeGreaterThan(0);
        for (const element of marked)
            expect(
                registered.has(element.getAttribute("data-kk-image-path")!),
            ).toBe(true);
    },
);

it("keeps saved footer decorations and their legacy URL fallback replaceable", () => {
    const settings = {
        decorLeftUrl: "/left.jpg",
        decorRightSource: {
            kind: "placeholder",
            description: "Right decoration",
        },
    };
    const { container } = paint(Footer, settings);
    expect(
        container.querySelector('[data-kk-image-path="decorLeftSource"] img'),
    ).toHaveAttribute("src", "/left.jpg");
    expect(
        container.querySelector(
            '[data-kk-image-path="decorRightSource"] [data-asset="waiting"]',
        ),
    ).toBeInTheDocument();
});

it("uses a dark brown header and drawer while retaining visible focus colors", () => {
    const { container } = paint(Header, {}, "dark");
    expect(container.innerHTML).not.toMatch(
        /#0f1a15|#1b2d24|rgb\(15, 26, 21\)|rgb\(27, 45, 36\)/i,
    );
    expect(container.innerHTML).toContain("rgb(30, 21, 15)");
});
