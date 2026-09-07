import { act, render, screen } from "@testing-library/react";
import Page from "@/app/(with-contexts)/(with-layout)/checkout/verify/page";
const mockRead = jest.fn();
let mockInvoiceId = "order-123";
beforeEach(() => {
    mockRead.mockReset();
    mockInvoiceId = "order-123";
});
jest.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(`id=${mockInvoiceId}`),
}));
jest.mock("@courselit/utils", () => ({
    FetchBuilder: jest.fn().mockImplementation(() => {
        const builder = {
            setUrl: () => builder,
            setHeaders: () => builder,
            setPayload: () => builder,
            build: () => ({ exec: () => mockRead() }),
        };
        return builder;
    }),
}));
jest.mock("@components/contexts", () => {
    const React = require("react");
    return {
        AddressContext: React.createContext({ backend: "" }),
        ThemeContext: React.createContext({ theme: { theme: {} } }),
    };
});
jest.mock("@courselit/page-primitives", () => ({
    Header2: ({ children }: any) => <h2>{children}</h2>,
    Text1: ({ children }: any) => <p>{children}</p>,
    Section: ({ children }: any) => <section>{children}</section>,
    Button: ({ children }: any) => <div>{children}</div>,
}));
it("keeps paid but unconfirmed class booking distinct from ordinary success", async () => {
    mockRead.mockResolvedValue({
        status: "paid",
        entityId: "course",
        classBooking: {
            kind: "paid-review",
            reference: "order-123",
            selectedStart: "2030-10-01T02:30:00.000Z",
            membership: "active",
        },
    });
    render(<Page />);
    expect(
        await screen.findByRole("heading", {
            name: "Payment recorded. Your class needs review.",
        }),
    ).toBeInTheDocument();
    expect(
        screen.getByText(/Your product membership is active/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Selected date:.*UTC/)).toBeInTheDocument();
    expect(
        screen.getByRole("link", { name: "Get booking help" }),
    ).toHaveAttribute("href", "/p/contact");
    expect(screen.getByRole("link", { name: "View receipt" })).toHaveAttribute(
        "href",
        "/dashboard/receipts/order-123",
    );
    expect(
        screen.queryByText("Your content is ready whenever you are."),
    ).not.toBeInTheDocument();
});
it("preserves ordinary paid receipt navigation", async () => {
    mockRead.mockResolvedValue({
        status: "paid",
        entityId: "course",
        classBooking: { kind: "none" },
    });
    render(<Page />);
    expect(
        await screen.findByRole("heading", { name: "You're in." }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole("link", { name: "Go to my content" }),
    ).toHaveAttribute("href", "/dashboard/my-content");
    expect(
        screen.queryByRole("link", { name: "Get booking help" }),
    ).not.toBeInTheDocument();
});
it("does not show a late response for a previous invoice under a new order reference", async () => {
    let release!: (data: unknown) => void;
    mockRead
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
        )
        .mockResolvedValue({
            status: "paid",
            entityId: "new-course",
            classBooking: {
                kind: "paid-review",
                reference: "new-order",
                selectedStart: "2031-10-01T02:30:00.000Z",
                membership: "unconfirmed",
            },
        });
    const view = render(<Page />);
    mockInvoiceId = "new-order";
    view.rerender(<Page />);
    expect(
        await screen.findByText(
            /Your product membership still needs confirmation/,
        ),
    ).toBeInTheDocument();
    await act(async () => {
        release({
            status: "paid",
            entityId: "old-course",
            classBooking: {
                kind: "completed",
                reference: "order-123",
                selectedStart: "2030-10-01T02:30:00.000Z",
            },
        });
    });
    expect(
        screen.queryByRole("heading", {
            name: "Your class booking is confirmed.",
        }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View receipt" })).toHaveAttribute(
        "href",
        "/dashboard/receipts/new-order",
    );
});
