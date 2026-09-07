import { render, screen, within } from "@testing-library/react";
import type { MemberRefundSummary } from "@courselit/common-models";
import RefundSummary from "..";
import { refundSummaryCopy as copy } from "../copy";

const summary: MemberRefundSummary = {
    kind: "observed",
    currency: "nzd",
    refundedAmount: 18.25,
    refunds: [
        { status: "succeeded", amount: 18.25 },
        { status: "pending", amount: 2.5 },
    ],
    observedAt: "2026-09-07T18:22:00Z",
};
it("shows major-unit amounts, separate exact statuses and the check time without replacing payment or access", () => {
    render(<RefundSummary summary={summary} />);
    const region = screen.getByRole("region", { name: copy.title });
    expect(within(region).getByText(copy.total)).toBeInTheDocument();
    expect(within(region).getAllByText(/NZD\s18\.25/)).toHaveLength(2);
    expect(within(region).getByText(/NZD\s2\.50/)).toBeInTheDocument();
    expect(within(region).getByText(copy.states.pending)).toBeInTheDocument();
    expect(within(region).getByText(copy.details.pending)).toBeInTheDocument();
    expect(region.querySelector("time")).toHaveAttribute(
        "dateTime",
        summary.observedAt,
    );
    expect(within(region).getByText(copy.separate)).toBeInTheDocument();
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
});
it.each(["requires_action", "failed", "canceled"] as const)(
    "keeps %s distinct from successful money",
    (status) => {
        render(
            <RefundSummary
                summary={{
                    ...summary,
                    refundedAmount: 0,
                    refunds: [{ status, amount: 11 }],
                }}
            />,
        );
        expect(screen.getByText(copy.states[status])).toBeInTheDocument();
        expect(screen.getByText(copy.details[status])).toBeInTheDocument();
        expect(
            screen.queryByText(copy.states.succeeded),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/NZD\s0\.00/)).toBeInTheDocument();
    },
);
it.each([undefined, { kind: "unrecorded" as const }])(
    "does not invent zero refunds when evidence is missing",
    (value) => {
        render(<RefundSummary summary={value} />);
        expect(screen.getByText(copy.unrecorded)).toBeInTheDocument();
        expect(screen.queryByText(copy.total)).not.toBeInTheDocument();
        expect(document.querySelector("time")).toBeNull();
    },
);
it("distinguishes a checked empty history and an unavailable check time", () => {
    render(
        <RefundSummary
            summary={{
                ...summary,
                refundedAmount: 0,
                refunds: [],
                observedAt: "invalid",
            }}
        />,
    );
    expect(screen.getByText(copy.empty)).toBeInTheDocument();
    expect(screen.getByText(copy.unknownTime)).toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
});
it.each([
    ["jpy", 250, /JPY\s250/],
    ["kwd", 1.234, /KWD\s1\.234/],
] as const)(
    "formats %s major units without a second minor-unit conversion",
    (currency, amount, formatted) => {
        render(
            <RefundSummary
                summary={{
                    ...summary,
                    currency,
                    refundedAmount: amount,
                    refunds: [{ status: "succeeded", amount }],
                }}
            />,
        );
        expect(screen.getAllByText(formatted)).toHaveLength(2);
    },
);
