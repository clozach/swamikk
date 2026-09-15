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

describe("main-site defaults retain the existing native design", () => {
    it.each([
        [
            "header",
            Header,
            "/swami-kk-logo.png",
            /#f7f4eb|rgb\(247, 244, 235\)/i,
        ],
        ["hero", Hero, "/anahata/hp-hero-bg.jpg", /#993300|rgb\(153, 51, 0\)/i],
        [
            "tour",
            Tour,
            "https://tour.anahata-retreat.org.nz/index.htm",
            /#993300|rgb\(153, 51, 0\)/i,
        ],
        [
            "private sessions",
            PrivateSessions,
            "/anahata/swami-kk-bio.jpg",
            /#993300|rgb\(153, 51, 0\)/i,
        ],
        [
            "gatherings",
            Gatherings,
            "/anahata/course-building-resilience-2026.png",
            /#993300|rgb\(153, 51, 0\)/i,
        ],
        [
            "newsletter",
            Newsletter,
            "/anahata/footer-callout-bg.jpg",
            /#252525|rgb\(37, 37, 37\)/i,
        ],
        [
            "posts",
            Posts,
            "/anahata/post-kumara-salad.jpg",
            /#f8ecdb|rgb\(248, 236, 219\)/i,
        ],
        [
            "footer",
            Footer,
            "/anahata/footer-logo-2021.png",
            /#216097|rgb\(33, 96, 151\)/i,
        ],
    ] as const)(
        "%s renders its real default asset and original palette",
        (_name, Widget, asset, color) => {
            const { container } = paint(Widget);
            expect(container.innerHTML).toContain(asset);
            expect(container.innerHTML).toMatch(color);
            expect(container.innerHTML).not.toMatch(/waiting for asset/i);
        },
    );

    it("keeps the banner and wordmark together, and the six original post thumbnails", () => {
        const hero = paint(Hero);
        expect(hero.container.innerHTML).toContain("/anahata/hp-hero-bg.jpg");
        expect(
            hero.container.querySelector(
                "img[src='/anahata/solutions-for-life.png']",
            ),
        ).toBeInTheDocument();
        const posts = paint(Posts);
        expect(
            Array.from(posts.container.querySelectorAll("img")).map((image) =>
                image.getAttribute("src"),
            ),
        ).toEqual([
            "/anahata/post-kumara-salad.jpg",
            "/anahata/post-menopause.png",
            "/anahata/post-autumn-tonic.png",
            "/anahata/post-nervous-system.png",
            "/anahata/post-nourish-bowl.png",
            "/anahata/post-tempeh-salad.png",
        ]);
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
    "saved %s images survive presentation restoration",
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
        shared: false,
        settings: {},
    } as WidgetInstance;
    const fields = pageWidgetFields(widget);
    const preview = pagePreviewSettings(widget);
    const banner = fields.find((field) => field.field === "bannerImage")!;
    expect(banner).toMatchObject({
        defaultDerived: true,
        value: { source: { kind: "url", url: "/anahata/hp-hero-bg.jpg" } },
    });
    expect(banner.placeholder).toBeUndefined();
    for (const field of fields.filter(
        (field) => !field.field.startsWith("paragraph:"),
    ))
        expect(preview[field.field]).toEqual(field.value);
    const { container } = paint(Hero, preview);
    expect(container.innerHTML).toContain("/anahata/hp-hero-bg.jpg");
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

describe("native text targets match the restored Posts renderer", () => {
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
        ["omitted settings", {}, "Read More at Our Blog", "buttonCaption"],
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
        expect(band.style.getPropertyValue("--nav-fg")).toBe("#f7f4eb");
        expect(band.style.getPropertyValue("--nav-fg-hover")).toBe("#ff9900");
    }
});

it.each(["light", "dark"] as const)(
    "gives drawer logout its own focus color in %s mode",
    (nextTheme) => {
        const view = render(
            <Header
                id="main-design"
                settings={{}}
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
        ).toBe("#ff9900");
        expect(window.getComputedStyle(drawer).backgroundColor).toBe(
            "rgb(38, 38, 38)",
        );
    },
);
