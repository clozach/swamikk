import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import MemberReceiptPage from "..";
import { receiptCopy as copy } from "../copy";
import type { MemberReceipt } from "@/services/member-receipts/types";
import { refundSummaryCopy } from "@/components/refund-summary/copy";
const fetchMock = jest.fn();
const originalFetch = global.fetch;
const receipt: MemberReceipt = {
    readOnly: false,
    invoiceId: "receipt-1",
    siteName: "Practice community",
    productName: "Members Library",
    amount: 11,
    currency: "NZD",
    mode: "test",
    settlement: {
        kind: "recorded",
        at: "2026-09-06T03:04:05Z",
        source: "stripe-checkout-confirmed",
    },
};
const response = (value: unknown) => ({ ok: true, json: async () => value });
beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
});
afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
});
it("shows recorded confirmation evidence, honest test mode and the native print control", async () => {
    fetchMock.mockResolvedValueOnce(response(receipt));
    const print = jest.spyOn(window, "print").mockImplementation(() => {});
    render(<MemberReceiptPage invoiceId="receipt-1" />);
    await screen.findByText(copy.test);
    expect(screen.getByText(copy.confirmedDate)).toBeInTheDocument();
    expect(screen.queryByText(copy.paidDate)).not.toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute(
        "dateTime",
        receipt.settlement.kind === "recorded" ? receipt.settlement.at : "",
    );
    fireEvent.click(screen.getByRole("button", { name: copy.print }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
});
it("an older receipt keeps its date and mode explicitly unknown in Mimic", async () => {
    fetchMock.mockResolvedValueOnce(
        response({
            ...receipt,
            readOnly: true,
            mode: "unknown",
            settlement: { kind: "unrecorded" },
        }),
    );
    render(<MemberReceiptPage invoiceId="receipt-1" />);
    await screen.findByText(copy.dateUnknown);
    expect(screen.getByText(copy.unknownMode)).toBeInTheDocument();
    expect(screen.getByText(copy.readOnly)).toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
});
it("a changed receipt route drops old data and ignores the old response", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(
        new Promise((done) => {
            resolve = done;
        }),
    );
    const { rerender } = render(<MemberReceiptPage invoiceId="receipt-1" />);
    fetchMock.mockResolvedValueOnce(
        response({
            ...receipt,
            invoiceId: "receipt-2",
            productName: "Second practice",
        }),
    );
    rerender(<MemberReceiptPage invoiceId="receipt-2" />);
    await screen.findByText("Second practice");
    await act(async () => {
        resolve(response(receipt));
    });
    expect(screen.queryByText("Members Library")).not.toBeInTheDocument();
    expect(screen.getByText("Second practice")).toBeInTheDocument();
});
it("failed access shows recovery without an old receipt body", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    render(<MemberReceiptPage invoiceId="unavailable" />);
    await screen.findByRole("alert");
    expect(screen.getByText(copy.unavailable)).toBeInTheDocument();
    expect(screen.queryByText("Members Library")).not.toBeInTheDocument();
});
it("refreshes external refund status in Mimic with read-only requests and keeps the original paid amount", async () => {
    const evidence = {
        kind: "observed",
        currency: "nzd",
        refundedAmount: 0,
        refunds: [{ status: "pending", amount: 4.25 }],
        observedAt: "2026-09-07T10:00:00Z",
    };
    fetchMock.mockResolvedValueOnce(
        response({ ...receipt, readOnly: true, refundSummary: evidence }),
    );
    render(<MemberReceiptPage invoiceId="receipt-1" />);
    await screen.findByText(refundSummaryCopy.states.pending);
    expect(screen.getByText(/NZD\s11\.00/)).toBeInTheDocument();
    expect(screen.getByText(/NZD\s4\.25/)).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(
        response({
            ...receipt,
            readOnly: true,
            refundSummary: {
                ...evidence,
                refunds: [{ status: "failed", amount: 4.25 }],
                observedAt: "2026-09-07T11:00:00Z",
            },
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: copy.refresh }));
    await screen.findByText(refundSummaryCopy.states.failed);
    expect(
        screen.queryByText(refundSummaryCopy.states.pending),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/NZD\s11\.00/)).toBeInTheDocument();
    expect(
        document.querySelector('time[datetime="2026-09-07T11:00:00Z"]'),
    ).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
        fetchMock.mock.calls.every(
            ([, init]) => !init.method && init.cache === "no-store",
        ),
    ).toBe(true);
});
