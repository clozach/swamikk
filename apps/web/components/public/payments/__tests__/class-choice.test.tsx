import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClassChoiceControl, useClassChoices } from "../class-choice";
const choice = {
    cohortId: "one",
    fingerprint: "a".repeat(64),
    name: "Spring class",
    startAt: "2030-10-01T02:30:00.000Z",
};
function Harness({
    userId,
    planType = "onetime",
}: {
    userId?: string;
    planType?: string;
}) {
    const state = useClassChoices("", "course", "plan", userId, planType);
    return (
        <>
            <ClassChoiceControl state={state} />
            <output aria-label="Selected class">
                {state.choice?.cohortId || "none"}
            </output>
        </>
    );
}
let read: jest.Mock;
beforeEach(() => {
    sessionStorage.clear();
    read = jest.fn(async () => ({
        ok: true,
        json: async () => ({ kind: "class", choices: [choice] }),
    }));
    global.fetch = read;
});
it("requires an explicit accessible date choice and restores it across sign-in only while current", async () => {
    const view = render(<Harness />);
    const select = await screen.findByRole("combobox", {
        name: "Class date (UTC)",
    });
    expect(select).toHaveValue("");
    expect(
        screen.getByRole("option", { name: /Spring class.*UTC/ }),
    ).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "one" } });
    expect(screen.getByLabelText("Selected class")).toHaveTextContent("one");
    read.mockImplementation(async (url: string) => ({
        ok: true,
        json: async () =>
            url.includes("/status")
                ? { kind: "none" }
                : { kind: "class", choices: [choice] },
    }));
    view.rerender(<Harness userId="signed-in" />);
    await waitFor(() =>
        expect(screen.getByRole("combobox")).toHaveValue("one"),
    );
    view.unmount();
    read.mockImplementation(async (url: string) => ({
        ok: true,
        json: async () =>
            url.includes("/status")
                ? { kind: "none" }
                : {
                      kind: "class",
                      choices: [{ ...choice, fingerprint: "b".repeat(64) }],
                  },
    }));
    render(<Harness userId="signed-in" />);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(""));
});
it("shows a durable reference and help for an uncertain checkout, including another selected plan", async () => {
    read.mockResolvedValue({
        ok: true,
        json: async () => ({ kind: "pending", reference: "order-123" }),
    });
    render(<Harness userId="signed-in" planType="subscription" />);
    expect(await screen.findByText("Reference: order-123")).toBeInTheDocument();
    expect(
        screen.getByRole("link", { name: "Get booking help" }),
    ).toHaveAttribute("href", "/p/contact");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(read.mock.calls.every(([url]) => url.includes("/status"))).toBe(
        true,
    );
});
it("keeps unavailable and all-closed offers visibly blocked, with a retry", async () => {
    read.mockRejectedValueOnce(new Error("offline"));
    render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "could not be checked",
    );
    read.mockResolvedValue({
        ok: true,
        json: async () => ({ kind: "class", choices: [] }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Check dates again" }));
    expect(
        await screen.findByText(/No class dates are open/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
it("keeps ordinary subscription checkout free of dated choices", async () => {
    render(<Harness planType="subscription" />);
    await waitFor(() =>
        expect(
            screen.queryByText("Checking class dates…"),
        ).not.toBeInTheDocument(),
    );
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
it("distinguishes a recorded payment from an unconfirmed class booking", async () => {
    read.mockImplementation(async (url: string) => ({
        ok: true,
        json: async () =>
            url.includes("/status")
                ? {
                      kind: "paid-review",
                      reference: "paid-order",
                      selectedStart: choice.startAt,
                      membership: "active",
                  }
                : { kind: "class", choices: [choice] },
    }));
    render(<Harness userId="signed-in" />);
    expect(
        await screen.findByText(
            "Payment recorded. Your class booking needs review.",
        ),
    ).toBeInTheDocument();
    expect(
        screen.getByText(/class roster has not been confirmed/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
