import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MailboxSettings from "../mailbox-settings";
import MailboxStatus from "../mailbox-status";
import { feedbackRequest } from "../api";
import { mailboxCopy as copy } from "../mailbox-copy";
jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

test("delivery starts visibly off and enabling requires explicit recipient approval", async () => {
    jest.mocked(feedbackRequest).mockResolvedValueOnce({
        settings: { kind: "off" },
        ownerEmail: "owner@example.com",
        canConfigure: true,
    });
    render(<MailboxSettings />);
    await screen.findByText(copy.off);
    fireEvent.click(screen.getByLabelText(copy.enable));
    expect(screen.getByLabelText(copy.recipient)).toHaveValue(
        "owner@example.com",
    );
    expect(screen.getByRole("button", { name: copy.save })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(copy.approve));
    jest.mocked(feedbackRequest).mockResolvedValueOnce({
        settings: {
            kind: "enabled",
            recipient: "owner@example.com",
            intervalMinutes: 60,
        },
        canConfigure: true,
    });
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    await screen.findByText(copy.saved);
    expect(feedbackRequest).toHaveBeenLastCalledWith("/api/feedback-mailbox", {
        kind: "enabled",
        recipient: "owner@example.com",
        intervalMinutes: 60,
        approvedPrivateRecipient: true,
    });
});
test("reviewers without settings permission cannot change mailbox recipients", async () => {
    jest.mocked(feedbackRequest).mockResolvedValueOnce({
        settings: { kind: "off" },
        ownerEmail: "owner@example.com",
        canConfigure: false,
    });
    render(<MailboxSettings />);
    await screen.findByText(copy.off);
    expect(screen.queryByLabelText(copy.enable)).not.toBeInTheDocument();
    expect(screen.getByText(copy.noSettings)).toBeInTheDocument();
});
test("an uncertain result requires a mailbox check before reconciliation", async () => {
    const onChanged = jest.fn().mockResolvedValue(undefined);
    const comment: any = {
        id: "a",
        state: "open",
        updatedAt: "2026-09-07T10:00:00.000Z",
        notification: {
            kind: "uncertain",
            attemptId: "attempt",
            recipient: "owner@example.com",
            attempts: 1,
            startedAt: "2026-09-07T10:00:00.000Z",
        },
    };
    render(<MailboxStatus comment={comment} onChanged={onChanged} />);
    expect(screen.getByRole("button", { name: copy.unsent })).toBeDisabled();
    expect(
        screen.queryByRole("button", { name: copy.retry }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(copy.verify));
    jest.mocked(feedbackRequest).mockResolvedValueOnce({});
    fireEvent.click(screen.getByRole("button", { name: copy.received }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(feedbackRequest).toHaveBeenCalledWith("/api/feedback-mailbox/a", {
        action: "confirm-received",
        expectedUpdatedAt: comment.updatedAt,
        verified: true,
    });
});
test("accepted notification has no resend control or delivery guarantee", () => {
    render(
        <MailboxStatus
            comment={
                {
                    id: "a",
                    state: "open",
                    notification: { kind: "accepted", evidence: "smtp" },
                } as any
            }
            onChanged={jest.fn()}
        />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(copy.acceptedHelp)).toBeInTheDocument();
});
