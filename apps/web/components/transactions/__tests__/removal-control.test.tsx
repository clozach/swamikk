import { render, screen, fireEvent } from "@testing-library/react";
import PurchaseRemovalControl from "../removal-control";
import { purchaseRemovalUi as copy } from "@/config/strings";

it("offers removal only when the server allowed it", () => {
    const onRemove = jest.fn();
    render(
        <PurchaseRemovalControl
            removal={{ kind: "allowed" }}
            onRemove={onRemove}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: copy.remove }));
    expect(onRemove).toHaveBeenCalledTimes(1);
});
it.each(["financial-history", "live-payment", "membership-changed"] as const)(
    "explains %s without offering a doomed action",
    (reason) => {
        render(
            <PurchaseRemovalControl
                removal={{ kind: "blocked", reason }}
                onRemove={jest.fn()}
            />,
        );
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(screen.getByText(copy.reasons[reason])).toBeInTheDocument();
    },
);
it("fails closed when eligibility is missing", () => {
    render(<PurchaseRemovalControl onRemove={jest.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(copy.unavailable)).toBeInTheDocument();
});
