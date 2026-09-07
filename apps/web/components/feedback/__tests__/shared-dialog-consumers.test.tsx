import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as WebDialog from "@/components/ui/dialog";
import * as WebSheet from "@/components/ui/sheet";
import * as WebAlert from "@/components/ui/alert-dialog";

// Keep the library's own Radix resolution, which differs from the web peer path.
const LibraryAlert = jest.requireActual(
    "../../../../../packages/components-library/src/components/ui/alert-dialog",
);

function NestedUpload() {
    return (
        <LibraryAlert.AlertDialog>
            <LibraryAlert.AlertDialogTrigger asChild>
                <button type="button">Upload file</button>
            </LibraryAlert.AlertDialogTrigger>
            <LibraryAlert.AlertDialogContent>
                <LibraryAlert.AlertDialogTitle>
                    Private attachment
                </LibraryAlert.AlertDialogTitle>
                <LibraryAlert.AlertDialogDescription>
                    Choose a private file
                </LibraryAlert.AlertDialogDescription>
                <input aria-label="Caption" />
                <LibraryAlert.AlertDialogCancel>
                    Cancel upload
                </LibraryAlert.AlertDialogCancel>
            </LibraryAlert.AlertDialogContent>
        </LibraryAlert.AlertDialog>
    );
}

const outerModals = [
    {
        name: "Dialog",
        Root: WebDialog.Dialog,
        Content: WebDialog.DialogContent,
        Title: WebDialog.DialogTitle,
        Description: WebDialog.DialogDescription,
    },
    {
        name: "Sheet",
        Root: WebSheet.Sheet,
        Content: WebSheet.SheetContent,
        Title: WebSheet.SheetTitle,
        Description: WebSheet.SheetDescription,
    },
    {
        name: "AlertDialog",
        Root: WebAlert.AlertDialog,
        Content: WebAlert.AlertDialogContent,
        Title: WebAlert.AlertDialogTitle,
        Description: WebAlert.AlertDialogDescription,
    },
];

test.each(outerModals)(
    "web $name yields to the actual library modal manager and receives focus back",
    async ({ Root, Content, Title, Description }) => {
        const user = userEvent.setup();
        render(
            <Root open>
                <Content>
                    <Title>Outer editor</Title>
                    <Description>Retain this editor</Description>
                    <NestedUpload />
                </Content>
            </Root>,
        );
        const trigger = screen.getByRole("button", { name: "Upload file" });
        await user.click(trigger);
        const caption = screen.getByRole("textbox", { name: "Caption" });
        await user.click(caption);
        await user.keyboard("Caption draft");
        expect(caption).toHaveFocus();
        expect(caption).toHaveValue("Caption draft");
        await user.click(screen.getByRole("button", { name: "Cancel upload" }));
        await waitFor(() => expect(trigger).toHaveFocus());
    },
);

test("the first-run plain Cancel keeps its appearance and shares the modal context", async () => {
    const user = userEvent.setup();
    render(
        <WebAlert.AlertDialog defaultOpen>
            <WebAlert.AlertDialogContent>
                <WebAlert.AlertDialogTitle>
                    First-run message
                </WebAlert.AlertDialogTitle>
                <WebAlert.AlertDialogDescription>
                    Existing appearance
                </WebAlert.AlertDialogDescription>
                <WebAlert.UnstyledAlertDialogCancel>
                    Continue
                </WebAlert.UnstyledAlertDialogCancel>
            </WebAlert.AlertDialogContent>
        </WebAlert.AlertDialog>,
    );
    const cancel = screen.getByRole("button", { name: "Continue" });
    expect(cancel).not.toHaveAttribute("class");
    await user.click(cancel);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
