import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import AdminOverviewPage from "..";
import { Actors, snapshot } from "./fixture";
import { overviewCopy as copy } from "../copy";

jest.mock("@/components/admin/dashboard-content", () => ({
    __esModule: true,
    default: ({ children }: any) => <main>{children}</main>,
}));
jest.mock("next/navigation", () => ({
    usePathname: () => "/dashboard/overview",
}));
let fetcher: jest.Mock;
beforeEach(() => {
    fetcher = jest
        .fn()
        .mockResolvedValue({ ok: true, json: async () => snapshot });
    global.fetch = fetcher;
});

it("uses native major-unit receipts with separate mode, refund evidence and original paid amount", async () => {
    render(
        <Actors>
            <AdminOverviewPage />
        </Actors>,
    );
    await screen.findByRole("heading", {
        name: "Payments and recorded refunds",
    });
    const testCard = screen
        .getByRole("heading", { name: "Test payments · NZD" })
        .closest("li")!;
    expect(within(testCard).getAllByText(/NZD\s9\.00/)).toHaveLength(2);
    expect(testCard).toHaveTextContent("Original paid amount");
    expect(testCard).toHaveTextContent("Recorded successful refunds");
    expect(testCard.querySelector("time")).toHaveAttribute(
        "dateTime",
        snapshot.payments[0].refundsCheckedAt,
    );
    const liveCard = screen
        .getByRole("heading", { name: "Live payments · USD" })
        .closest("li")!;
    expect(liveCard).toHaveTextContent(
        "0 of 1 receipts have a refund observation",
    );
    expect(liveCard).toHaveTextContent(
        "Missing observations are not zero refunds",
    );
    expect(screen.getByText(copy.money)).toBeVisible();
    expect(screen.getByText(/excluded from period totals/)).toBeVisible();
    expect(
        screen.getByRole("link", { name: "Open transactions" }),
    ).toHaveAttribute("href", "/dashboard/transactions");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(
        screen.queryByRole("button", { name: /refund|grant|resend/i }),
    ).toBeNull();
});

it.each([
    [["course:manage_any"], "inactive"],
    [["setting:manage"], "expired"],
] as const)(
    "does not fetch or expose finance without real site settings authority (%j, %s)",
    async (permissions, kind) => {
        render(
            <Actors permissions={[...permissions]} kind={kind}>
                <AdminOverviewPage />
            </Actors>,
        );
        expect(screen.getByText(copy.permission)).toBeVisible();
        expect(fetcher).not.toHaveBeenCalled();
        expect(
            screen.queryByRole("heading", {
                name: "Payments and recorded refunds",
            }),
        ).toBeNull();
    },
);

it("clears loaded private data immediately when identity or permission changes", async () => {
    const view = render(
        <Actors>
            <AdminOverviewPage />
        </Actors>,
    );
    await screen.findByText("Test payments · NZD");
    view.rerender(
        <Actors permissions={["course:manage_any"]}>
            <AdminOverviewPage />
        </Actors>,
    );
    expect(screen.queryByText("Test payments · NZD")).toBeNull();
    expect(screen.getByText(copy.permission)).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(1);
});

it("shows unavailable health on failed reads and supports an explicit refresh", async () => {
    fetcher.mockResolvedValueOnce({ ok: false });
    render(
        <Actors>
            <AdminOverviewPage />
        </Actors>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.failed);
    expect(screen.queryByText(copy.noIssues)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.refresh }));
    expect(await screen.findByText(copy.noIssues)).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(2);
});

it("aborts an obsolete period read and never shows its late private response", async () => {
    let finish!: (value: unknown) => void;
    fetcher.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    render(
        <Actors>
            <AdminOverviewPage />
        </Actors>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Payment period" }), {
        target: { value: "30" },
    });
    await screen.findByText("Test payments · NZD");
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetcher.mock.calls[1][0]).toBe("/api/admin-overview?days=30");
    await act(async () => {
        finish({
            ok: true,
            json: async () => ({
                ...snapshot,
                payments: [{ ...snapshot.payments[0], currency: "JPY" }],
            }),
        });
    });
    expect(screen.queryByText("Test payments · JPY")).toBeNull();
});

it("support opens source diagnostics, not a second bespoke member or money dashboard", async () => {
    render(
        <Actors>
            <AdminOverviewPage diagnostics />
        </Actors>,
    );
    await waitFor(() =>
        expect(screen.getByText("Snapshot ID: snapshot-one")).toBeVisible(),
    );
    expect(screen.getByText(copy.recovery)).toBeVisible();
    expect(screen.getByText(copy.uncollected)).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    expect(
        screen.queryByRole("heading", {
            name: "Payments and recorded refunds",
        }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Open overview" })).toHaveAttribute(
        "href",
        "/dashboard/overview",
    );
});
