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
