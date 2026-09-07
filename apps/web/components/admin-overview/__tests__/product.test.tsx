import { render, screen } from "@testing-library/react";
import ProductPage from "@/app/(with-contexts)/dashboard/(sidebar)/product/[id]/page";
import { Actors } from "./fixture";
import { useActivities } from "@/hooks/use-activities";

jest.mock("next/navigation", () => ({
    useParams: () => ({ id: "library" }),
    redirect: jest.fn(),
}));
jest.mock("@/components/admin/dashboard-content", () => ({
    __esModule: true,
    default: ({ children }: any) => <main>{children}</main>,
}));
jest.mock("@/hooks/use-product", () => ({
    __esModule: true,
    default: () => ({
        loaded: true,
        product: {
            title: "Members library",
            type: "course",
            published: true,
            lessons: ["lesson"],
            pageId: "library",
            createdAt: "2026-09-01T12:00:00Z",
        },
    }),
}));
jest.mock("@/hooks/use-activities", () => ({
    useActivities: jest.fn(() => ({
        data: { count: 4, growth: 0 },
        loading: false,
    })),
}));
jest.mock("@courselit/components-library", () => ({
    useToast: () => ({ toast: jest.fn() }),
    Tooltip: ({ children }: any) => children,
}));

it("product overview offers native transactions and keeps non-money metrics without requesting mixed purchase activity as sales", () => {
    render(
        <Actors>
            <ProductPage />
        </Actors>,
    );
    expect(
        screen.getByRole("link", {
            name: /Transactions Review original payments/,
        }),
    ).toHaveAttribute("href", "/dashboard/product/library/transactions");
    expect(screen.getByText("Customers")).toBeVisible();
    expect(screen.getByText("People who completed the course")).toBeVisible();
    expect(screen.queryByText("Sales")).toBeNull();
    const types = (useActivities as jest.Mock).mock.calls.map(
        (call) => call[0],
    );
    expect(types).toContain("enrolled");
    expect(types).toContain("course_completed");
    expect(types).not.toContain("purchased");
});
