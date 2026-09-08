import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductCard } from "../../../../../packages/page-blocks/src/components/product-card";
import { Constants } from "@courselit/common-models";
import {
    catalogProductKind,
    catalogProductPrice,
} from "../../../../../packages/page-blocks/src/components/catalog-product";

// Exercise the package's real renderer without applying the web app's
// stricter compiler settings to this separately checked package source.
const Banner =
    require("../../../../../packages/page-blocks/src/blocks/banner/widget").default;

jest.mock("@courselit/components-library", () => ({
    useToast: () => ({ toast: jest.fn() }),
    getSymbolFromCurrency: () => "NZD ",
    Image: ({ alt }: any) => <span>{alt}</span>,
    Link: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
    Skeleton: () => null,
    MediaPlayer: ({ src, title }: any) => (
        <div role="group" aria-label={title}>
            <audio src={src} />
            <button type="button">Play sample</button>
        </div>
    ),
}));
jest.mock("@courselit/page-primitives", () => ({
    Section: ({ children }: any) => <section>{children}</section>,
    Header1: ({ children }: any) => <h1>{children}</h1>,
    Preheader: ({ children }: any) => <span>{children}</span>,
    Button: ({ children }: any) => <button>{children}</button>,
    Badge: ({ children }: any) => <span>{children}</span>,
    PageCardHeader: ({ children }: any) => <h2>{children}</h2>,
    Subheader1: ({ children }: any) => <span>{children}</span>,
    PageCardContent: ({ children }: any) => <div>{children}</div>,
    PageCard: ({ children }: any) => <article>{children}</article>,
    PageCardImage: ({ alt }: any) => <img alt={alt} />,
}));
jest.mock("../../../../../packages/page-blocks/src/components", () => ({
    TextRenderer: () => <p>About this practice</p>,
}));

describe("public product banner preview", () => {
    const bannerProps = (previewAudio?: unknown) =>
        ({
            settings: { alignment: "left", editingViewShowSuccess: "0" },
            state: {
                theme: {
                    theme: {
                        structure: {
                            page: { width: "full" },
                            section: { padding: { y: "md" } },
                        },
                    },
                },
                siteinfo: { currencyISOCode: "NZD" },
            },
            pageData: {
                pageType: Constants.PageType.PRODUCT,
                title: "Natural breathing",
                courseId: "breathing",
                description: JSON.stringify({ type: "doc" }),
                paymentPlans: [],
                previewAudio,
            },
            editing: false,
        }) as any;

    it("offers the shared audio sample separately from Buy now without autoplay", () => {
        const { container } = render(
            <Banner
                {...bannerProps({
                    file: "https://media.example/sample.mp3",
                    access: "public",
                    mimeType: "audio/mpeg",
                })}
            />,
        );
        expect(
            screen.getByRole("group", {
                name: "Audio preview: Natural breathing",
            }),
        ).toBeVisible();
        const buy = screen.getByRole("link", { name: "Buy now" });
        expect(buy).toHaveAttribute(
            "href",
            "/checkout?type=course&id=breathing",
        );
        const navigate = jest.fn();
        buy.addEventListener("click", navigate);
        fireEvent.click(screen.getByRole("button", { name: "Play sample" }));
        expect(navigate).not.toHaveBeenCalled();
        expect(container.querySelector("audio")).not.toHaveAttribute(
            "autoplay",
        );
        expect(container.querySelector("audio")?.closest("a")).toBeNull();
    });

    it.each([
        undefined,
        {
            file: "https://media.example/full.mp3",
            access: "private",
            mimeType: "audio/mpeg",
        },
        {
            file: "https://media.example/movie.mp4",
            access: "public",
            mimeType: "video/mp4",
        },
    ])("omits unavailable or ineligible samples: %p", (preview) => {
        const { container } = render(<Banner {...bannerProps(preview)} />);
        expect(container.querySelector("audio")).toBeNull();
        expect(screen.getByRole("link", { name: "Buy now" })).toBeVisible();
    });
});

it("keeps sample controls outside the product link", () => {
    const onNavigate = jest.fn();
    const { container } = render(
        <ProductCard
            title="Natural breathing"
            user={{ name: "KK", thumbnail: "" }}
            href="/p/natural-breathing"
            image="/cover.jpg"
            productType="Download"
            previewAudio={
                {
                    mediaId: "sample",
                    file: "/sample.mp3",
                    access: "public",
                } as any
            }
        />,
    );
    const link = screen.getByRole("link");
    link.addEventListener("click", onNavigate);
    const play = screen.getByRole("button", { name: "Play sample" });
    expect(play.closest("a")).toBeNull();
    expect(container.querySelector("audio")).not.toHaveAttribute("autoplay");
    fireEvent.click(play);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByText("Download")).toBeVisible();
});

it("shows only available previews and names membership, classes and downloads", () => {
    render(
        <ProductCard
            title="Class"
            user={{ name: "KK", thumbnail: "" }}
            href="/p/class"
            image="/cover.jpg"
        />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
        catalogProductKind({
            type: "COURSE",
            paymentPlans: [{ type: "SUBSCRIPTION" }],
        } as any),
    ).toBe("Membership");
    expect(catalogProductKind({ type: "COURSE" } as any)).toBe("Class");
    expect(catalogProductKind({ type: "DOWNLOAD" } as any)).toBe("Download");
});

it("shows an explicit monthly price when offered and omits once from one-time purchases", () => {
    expect(
        catalogProductPrice(
            {
                paymentPlans: [
                    {
                        type: "SUBSCRIPTION",
                        subscriptionMonthlyAmount: 20,
                        subscriptionYearlyAmount: 200,
                    },
                ],
            } as any,
            "NZD",
        ),
    ).toBe("NZD 20.00 / month");
    expect(
        catalogProductPrice(
            { paymentPlans: [{ type: "ONEtime", oneTimeAmount: 12 }] } as any,
            "NZD",
        ),
    ).toBe("NZD 12.00");
    expect(
        catalogProductPrice(
            {
                paymentPlans: [
                    { type: "SUBSCRIPTION", subscriptionYearlyAmount: 200 },
                ],
            } as any,
            "USD",
        ),
    ).toBe("USD 200.00 / year");
});
