import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductCard } from "../../../../../packages/page-blocks/src/components/product-card";
import {
    catalogProductKind,
    catalogProductPrice,
} from "../../../../../packages/page-blocks/src/components/catalog-product";

jest.mock("@courselit/components-library", () => ({
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
    Badge: ({ children }: any) => <span>{children}</span>,
    PageCardHeader: ({ children }: any) => <h2>{children}</h2>,
    Subheader1: ({ children }: any) => <span>{children}</span>,
    PageCardContent: ({ children }: any) => <div>{children}</div>,
    PageCard: ({ children }: any) => <article>{children}</article>,
    PageCardImage: ({ alt }: any) => <img alt={alt} />,
}));

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
