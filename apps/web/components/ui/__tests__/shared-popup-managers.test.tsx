import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as Dialog from "../dialog";
import * as Sheet from "../sheet";
import * as Menu from "../dropdown-menu";
import * as Select from "../select";
import * as Popover from "../popover";

const parents = [
    {
        name: "Dialog",
        Root: Dialog.Dialog,
        Content: Dialog.DialogContent,
        Title: Dialog.DialogTitle,
        Description: Dialog.DialogDescription,
    },
    {
        name: "Sheet",
        Root: Sheet.Sheet,
        Content: Sheet.SheetContent,
        Title: Sheet.SheetTitle,
        Description: Sheet.SheetDescription,
    },
];

type Parent = (typeof parents)[number];
function Fixture({
    parent: { Root, Content, Title, Description },
    child,
}: {
    parent: Parent;
    child: "menu" | "select" | "popover";
}) {
    const [value, setValue] = useState("");
    const [open, setOpen] = useState(false);
    return (
        <Root defaultOpen>
            <Content>
                <Title>Unsent editor</Title>
                <Description>Keep the parent draft</Description>
                <textarea
                    aria-label="Outer draft"
                    defaultValue="Retained draft"
                />
                <output aria-label="Chosen value">{value}</output>
                {child === "menu" && (
                    <Menu.DropdownMenu>
                        <Menu.DropdownMenuTrigger>
                            Choose action
                        </Menu.DropdownMenuTrigger>
                        <Menu.DropdownMenuContent>
                            <Menu.DropdownMenuItem
                                onSelect={() => setValue("First")}
                            >
                                First
                            </Menu.DropdownMenuItem>
                            <Menu.DropdownMenuItem
                                onSelect={() => setValue("Second")}
                            >
                                Second
                            </Menu.DropdownMenuItem>
                        </Menu.DropdownMenuContent>
                    </Menu.DropdownMenu>
                )}
                {child === "select" && (
                    <Select.Select onValueChange={setValue}>
                        <Select.SelectTrigger aria-label="Choose size">
                            <Select.SelectValue placeholder="Choose size" />
                        </Select.SelectTrigger>
                        <Select.SelectContent>
                            <Select.SelectItem value="small">
                                Small
                            </Select.SelectItem>
                            <Select.SelectItem value="large">
                                Large
                            </Select.SelectItem>
                        </Select.SelectContent>
                    </Select.Select>
                )}
                {child === "popover" && (
                    <Popover.Popover open={open} onOpenChange={setOpen}>
                        <Popover.PopoverTrigger>
                            Open note
                        </Popover.PopoverTrigger>
                        <Popover.PopoverContent>
                            <input
                                aria-label="Unsent note"
                                value={value}
                                onChange={(event) =>
                                    setValue(event.target.value)
                                }
                            />
                            <button onClick={() => setOpen(false)}>
                                Close note
                            </button>
                        </Popover.PopoverContent>
                    </Popover.Popover>
                )}
            </Content>
        </Root>
    );
}

// jsdom lacks these browser geometry/pointer APIs. The real managers remain unmocked.
const scrollIntoView = HTMLElement.prototype.scrollIntoView;
const hasPointerCapture = HTMLElement.prototype.hasPointerCapture;
const releasePointerCapture = HTMLElement.prototype.releasePointerCapture;
beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = () => {};
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.releasePointerCapture = () => {};
});
afterAll(() => {
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    HTMLElement.prototype.hasPointerCapture = hasPointerCapture;
    HTMLElement.prototype.releasePointerCapture = releasePointerCapture;
});

describe.each(parents)("$name shares popup focus and dismissal", (parent) => {
    test("menu arrows and Enter select inside the menu and return to its trigger", async () => {
        const user = userEvent.setup();
        render(<Fixture parent={parent} child="menu" />);
        const trigger = screen.getByRole("button", { name: "Choose action" });
        trigger.focus();
        await user.keyboard("{Enter}");
        await waitFor(() =>
            expect(
                document.activeElement?.closest('[role="menu"]'),
            ).not.toBeNull(),
        );
        await user.keyboard("{ArrowDown}{Enter}");
        await waitFor(() =>
            expect(screen.getByLabelText("Chosen value")).toHaveTextContent(
                "Second",
            ),
        );
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(screen.getByLabelText("Outer draft")).toHaveValue(
            "Retained draft",
        );
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    test("select arrows and Enter choose an option without editing the outer draft", async () => {
        const user = userEvent.setup();
        render(<Fixture parent={parent} child="select" />);
        const trigger = screen.getByRole("combobox", { name: "Choose size" });
        trigger.focus();
        await user.keyboard("{ArrowDown}");
        await waitFor(() =>
            expect(
                document.activeElement?.closest('[role="listbox"]'),
            ).not.toBeNull(),
        );
        await user.keyboard("{ArrowDown}{Enter}");
        await waitFor(() =>
            expect(screen.getByLabelText("Chosen value")).toHaveTextContent(
                "large",
            ),
        );
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(screen.getByLabelText("Outer draft")).toHaveValue(
            "Retained draft",
        );
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
    test("popover accepts local typing and Escape closes only the child, returning focus", async () => {
        const user = userEvent.setup();
        render(<Fixture parent={parent} child="popover" />);
        const trigger = screen.getByRole("button", { name: "Open note" });
        await user.click(trigger);
        const input = screen.getByLabelText("Unsent note");
        await user.click(input);
        await user.keyboard("Local note");
        expect(input).toHaveFocus();
        expect(input).toHaveValue("Local note");
        await user.keyboard("{Escape}");
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(screen.queryByLabelText("Unsent note")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Outer draft")).toHaveValue(
            "Retained draft",
        );
        expect(screen.getByLabelText("Chosen value")).toHaveTextContent(
            "Local note",
        );
    });
});
