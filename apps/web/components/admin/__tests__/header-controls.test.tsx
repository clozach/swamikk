import React, { Suspense } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { CourseFrontend } from "@/app/(with-contexts)/course/[slug]/[id]/helpers";

const mockSetTheme = jest.fn();
let mockTheme = "light";
jest.mock("next-themes", () => ({
    useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}));
jest.mock("next/navigation", () => ({
    usePathname: () => "/course/test/course-1",
    useSearchParams: () =>
        new URLSearchParams("returnTo=%2Fdashboard%2Fmy-content"),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("next/link", () => {
    const React = require("react");
    return React.forwardRef(function MockLink(
        { children, ...props }: any,
        ref: any,
    ) {
        return (
            <a ref={ref} {...props}>
                {children}
            </a>
        );
    });
});
jest.mock("next/head", () => () => null);
jest.mock("@/components/public/base-layout/branding", () => () => null);
jest.mock("next/dynamic", () => () => () => null);
jest.mock("@/lib/utils", () => jest.requireActual("@/lib/shadcn-utils"));
jest.mock("@/lib/use-private-palette", () => ({ usePrivatePalette: () => "" }));
jest.mock("@components/member-mimic/context", () => ({
    useMemberMimic: () => ({ kind: "inactive" }),
}));
jest.mock("@components/contexts", () => {
    const React = require("react");
    return {
        ProfileContext: React.createContext({
            profile: { userId: "member", purchases: [] },
        }),
        SiteInfoContext: React.createContext({
            title: "Anahata",
            hideCourseLitBranding: true,
        }),
        ThemeContext: React.createContext({ theme: {} }),
        AddressContext: React.createContext({
            backend: "http://localhost:3001",
            frontend: "http://localhost:3001",
        }),
    };
});
jest.mock("@components/ui/sidebar", () => {
    const children = ({ children }: any) => children;
    return Object.fromEntries([
        ...[
            "Sidebar",
            "SidebarContent",
            "SidebarGroup",
            "SidebarGroupContent",
            "SidebarGroupLabel",
            "SidebarHeader",
            "SidebarInset",
            "SidebarMenu",
            "SidebarMenuButton",
            "SidebarMenuItem",
            "SidebarProvider",
        ].map((key) => [key, children]),
        ["SidebarTrigger", () => null],
        [
            "useSidebar",
            () => ({
                open: false,
                openMobile: false,
                isMobile: false,
                setOpenMobile: jest.fn(),
            }),
        ],
    ]);
});
jest.mock("@courselit/components-library", () => ({
    IconButton: jest.requireActual(
        "../../../../../packages/components-library/src/icon-button",
    ).default,
    Tooltip: jest.requireActual(
        "../../../../../packages/components-library/src/tooltip",
    ).default,
    Link: jest.requireActual(
        "../../../../../packages/components-library/src/link",
    ).default,
    Button2: jest.requireActual(
        "../../../../../packages/components-library/src/components/ui/button",
    ).Button,
    Image: () => null,
    Skeleton: () => null,
    useToast: () => ({ toast: jest.fn() }),
}));
jest.mock("@courselit/page-blocks", () => ({ TextRenderer: () => null }));
jest.mock("@courselit/text-editor", () => ({
    Editor: () => null,
    emptyDoc: {},
}));
jest.mock("@courselit/icons", () => ({
    CheckCircled: () => null,
    Circle: () => null,
    Lock: () => null,
    Sync: () => null,
    Menu: () => null,
    Exit: () => null,
}));
jest.mock("@courselit/page-primitives", () => ({
    Caption: ({ children }: any) => children,
}));
jest.mock("@/components/public/product-discussions/panel", () => () => null);
jest.mock("@ui-lib/utils", () => ({
    formattedLocaleDate: () => "",
    isEnrolled: () => true,
    isLessonCompleted: () => false,
    generateFontString: () => "",
    truncate: (value: string) => value,
}));
jest.mock("@courselit/utils", () => ({
    truncate: (value: string) => value,
    debounce: () => () => undefined,
    FetchBuilder: class {
        setUrl() {
            return this;
        }
        setIsGraphQLEndpoint() {
            return this;
        }
        setPayload() {
            return this;
        }
        build() {
            return {
                exec: async () => ({
                    site: { draftTypefaces: [] },
                    pages: [],
                    page: {
                        pageId: "homepage",
                        type: "site",
                        name: "Home",
                        layout: [],
                        draftLayout: [],
                    },
                }),
            };
        }
    },
}));
jest.mock("@/components/admin/page-editor/use-themes", () => () => ({}));
jest.mock("@/components/admin/page-editor/seo-editor", () => () => null);
jest.mock("@/components/public/base-layout/template", () => () => null);
jest.mock("@ui-config/widgets", () => ({}));
jest.mock(
    "@/ui-config/strings",
    () => jest.requireActual("@ui-config/strings"),
    { virtual: true },
);
jest.mock(
    "@/ui-lib/utils",
    () => ({
        generateFontString: () => "",
        moveMemberUp: jest.fn(),
        moveMemberDown: jest.fn(),
    }),
    { virtual: true },
);
jest.mock("@/hooks/use-product", () => () => ({
    product: { groups: [] },
    loaded: true,
}));

import NextThemeSwitcher from "../next-theme-switcher";
import LegacyHeader from "@/components/public/base-layout/header";
import LegacyExit from "@/components/public/base-layout/exit-course-button";
import ProductPage from "@/app/(with-contexts)/course/[slug]/[id]/layout-with-sidebar";
import LeanDownloadLayout from "@/app/(with-contexts)/course/[slug]/[id]/lean-download-layout";
import PageEditor from "../page-editor";
import EmailTemplate from "@/app/(with-contexts)/dashboard/mail/template/[id]/page";
import EmailSequence from "@/app/(with-contexts)/dashboard/mail/sequence/[sequenceId]/[mailId]/page";
import EmailDrip from "@/app/(with-contexts)/dashboard/mail/drip/[productId]/[sectionId]/page";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
    BTN_EXIT_COURSE_TOOLTIP,
    BTN_TOGGLE_THEME,
    EDIT_PAGE_BUTTON_DONE,
    EDIT_PAGE_BUTTON_SEO,
    EDIT_PAGE_BUTTON_THEME,
    EDIT_PAGE_BUTTON_VIEW,
} from "@ui-config/strings";

const product = {
    courseId: "course-1",
    slug: "test",
    title: "Course",
    groups: [],
    tags: [],
    paymentPlans: [],
} as unknown as CourseFrontend;
function assertSingleLink(name: string, href: string) {
    const link = screen.getByRole("link", { name });
    expect(link).toHaveAttribute("href", href);
    expect(link.querySelector("button, a")).toBeNull();
    expect(link.parentElement?.closest("button, a")).toBeNull();
}
function assertNamedHeaderControls() {
    const header = screen.getByRole("banner");
    const view = within(header);
    for (const control of [
        ...view.queryAllByRole("button"),
        ...view.queryAllByRole("link"),
    ])
        expect(control).toHaveAccessibleName();
}
beforeEach(() => {
    mockTheme = "light";
    mockSetTheme.mockClear();
});

test("theme control has an accessible name before the tooltip opens and still toggles both ways", () => {
    const { rerender } = render(
        <TooltipProvider>
            <NextThemeSwitcher />
        </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: BTN_TOGGLE_THEME }));
    expect(mockSetTheme).toHaveBeenLastCalledWith("dark");
    mockTheme = "dark";
    rerender(
        <TooltipProvider>
            <NextThemeSwitcher />
        </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: BTN_TOGGLE_THEME }));
    expect(mockSetTheme).toHaveBeenLastCalledWith("light");
});
test.each([
    ["course", ProductPage],
    ["download", LeanDownloadLayout],
] as const)(
    "%s header exits through one named link with no nested button",
    (_label, Layout) => {
        render(
            <TooltipProvider>
                <Layout product={product}>Lesson</Layout>
            </TooltipProvider>,
        );
        assertSingleLink(BTN_EXIT_COURSE_TOOLTIP, "/dashboard/my-content");
        assertNamedHeaderControls();
    },
);
test("page-editor header has named actions and single View/Done links", async () => {
    render(
        <PageEditor
            {...({
                id: "homepage",
                address: { backend: "http://localhost:3001" },
                profile: {},
                siteInfo: {},
                typefaces: [],
                state: { theme: { theme: {} } },
            } as any)}
        />,
    );
    await screen.findByRole("banner");
    expect(
        screen.getByRole("button", { name: EDIT_PAGE_BUTTON_THEME }),
    ).toBeVisible();
    expect(
        screen.getByRole("button", { name: EDIT_PAGE_BUTTON_SEO }),
    ).toBeVisible();
    assertSingleLink(EDIT_PAGE_BUTTON_VIEW, "/p/homepage");
    assertSingleLink(EDIT_PAGE_BUTTON_DONE, "/dashboard/products");
    assertNamedHeaderControls();
});
test.each([
    [
        "template",
        EmailTemplate,
        { id: "template-1" },
        "/dashboard/mails/template/template-1",
    ],
    [
        "sequence",
        EmailSequence,
        { sequenceId: "sequence-1", mailId: "mail-1" },
        "/dashboard/mails?tab=Broadcasts",
    ],
    [
        "drip",
        EmailDrip,
        { productId: "course-1", sectionId: "section-1" },
        "/dashboard/product/course-1/content/section/section-1",
    ],
] as const)(
    "%s email header has one named Exit link with no nested button",
    async (_label, Component, params, href) => {
        const Editor = Component as React.ComponentType<{
            params: Promise<any>;
        }>;
        await act(async () => {
            render(
                <Suspense fallback="Loading">
                    <Editor params={Promise.resolve(params)} />
                </Suspense>,
            );
        });
        await screen.findByRole("banner");
        assertSingleLink("Exit", href);
        assertNamedHeaderControls();
    },
);

test("legacy course header menu is named and still invokes the opening action", () => {
    const onMenuClick = jest.fn();
    render(
        <LegacyHeader
            siteinfo={{ title: "Anahata" } as any}
            onMenuClick={onMenuClick}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
    assertNamedHeaderControls();
});
test("legacy course Exit uses one named link rather than a link containing a button", () => {
    render(<LegacyExit />);
    assertSingleLink("Exit", "/dashboard/my-content");
});
