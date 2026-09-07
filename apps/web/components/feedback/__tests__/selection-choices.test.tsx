import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectionChoices } from "../selection-choices";
import type { PageSelection } from "../targets";

const choices: PageSelection[] = ["Whole page", "Practice", "Help"].map(
    (label) => ({
        label,
        element: null,
        target: { kind: "page", path: "/", componentId: label, label },
    }),
);

test("up/down moves focus through choices without selecting or scrolling; Enter chooses that exact item", async () => {
    const user = userEvent.setup();
    const selected = jest.fn();
    render(<SelectionChoices choices={choices} onSelect={selected} />);
    const [wholePage, practice, help] = screen.getAllByRole("button");
    wholePage.focus();
    expect(fireEvent.keyDown(wholePage, { key: "ArrowDown" })).toBe(false);
    expect(practice).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(help).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(help).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(practice).toHaveFocus();
    expect(selected).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(selected).toHaveBeenCalledTimes(1);
    expect(selected).toHaveBeenCalledWith(choices[1]);
});

test("native Tab/Shift+Tab, Space, and Escape remain available", async () => {
    const user = userEvent.setup();
    const selected = jest.fn();
    const escape = jest.fn();
    render(
        <div onKeyDown={(event) => event.key === "Escape" && escape()}>
            <SelectionChoices choices={choices} onSelect={selected} />
            <button>Close</button>
        </div>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Whole page" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Practice" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Whole page" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "Whole page" })).toHaveFocus();
    await user.keyboard(" ");
    expect(selected).toHaveBeenCalledWith(choices[0]);
    await user.keyboard("{Escape}");
    expect(escape).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Help" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
});

test("modified arrows keep native behavior and updated choices retain exact selection", async () => {
    const user = userEvent.setup();
    const selected = jest.fn();
    const view = render(
        <SelectionChoices choices={choices} onSelect={selected} />,
    );
    const first = screen.getByRole("button", { name: "Whole page" });
    first.focus();
    expect(fireEvent.keyDown(first, { key: "ArrowDown", ctrlKey: true })).toBe(
        true,
    );
    expect(first).toHaveFocus();
    view.rerender(
        <SelectionChoices
            choices={[choices[0], choices[2]]}
            onSelect={selected}
        />,
    );
    await user.keyboard("{ArrowDown}{Enter}");
    expect(selected).toHaveBeenCalledWith(choices[2]);
});
