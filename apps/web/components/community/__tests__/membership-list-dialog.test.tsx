import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { MembershipList } from "../membership-list";

const mockRequests: { query: string; variables: unknown }[] = [];
const member = {
    user: {
        userId: "synthetic-member",
        name: "Fixture member",
        email: "fixture@example.test",
    },
    status: "active",
    role: "member",
};
jest.mock("@courselit/utils", () => ({
    ...jest.requireActual("@courselit/utils"),
    FetchBuilder: class {
        payload: { query: string; variables: unknown };
        setUrl() {
            return this;
        }
        setIsGraphQLEndpoint() {
            return this;
        }
        setPayload(payload: typeof this.payload) {
            this.payload = payload;
            return this;
        }
        build() {
            return this;
        }
        async exec() {
            mockRequests.push(this.payload);
            return this.payload.query.includes("mutation")
                ? { member: { ...member, status: "rejected" } }
                : { members: [member], totalMembers: 1 };
        }
    },
}));
jest.mock("@courselit/components-library", () => ({
    Badge: ({ children }) => <span>{children}</span>,
    Link: ({ children, href }) => <a href={href}>{children}</a>,
    PaginatedTable: ({ children }) => <div>{children}</div>,
    Tooltip: ({ children, title }) => <span title={title}>{children}</span>,
    useToast: () => ({ toast: jest.fn() }),
}));
jest.mock("next/navigation", () => ({
    useRouter: () => ({ replace: jest.fn() }),
}));

test("rejection keeps reason validation and exact request while close returns focus without writing", async () => {
    mockRequests.length = 0;
    render(<MembershipList id="synthetic-community" />);
    await screen.findByText("Fixture member");
    const opener = within(screen.getByTitle("Change status")).getByRole(
        "button",
    );
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    const actions = dialog.querySelector<HTMLElement>(
        ".kk-viewport-dialog-actions",
    )!;
    const body = dialog.querySelector<HTMLElement>(".kk-viewport-dialog-body")!;
    expect(body).not.toContainElement(actions);
    expect(body).toHaveAttribute("tabindex", "0");
    const confirm = screen.getByRole("button", { name: "Confirm Rejection" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), {
        target: { value: "Fixture reason" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(
        mockRequests.filter((r) => r.query.includes("mutation")),
    ).toHaveLength(0);
    fireEvent.click(opener);
    expect(screen.getByLabelText("Reason")).toHaveValue("Fixture reason");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Rejection" }));
    await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const writes = mockRequests.filter((r) => r.query.includes("mutation"));
    expect(writes).toHaveLength(1);
    expect(writes[0].variables).toEqual({
        communityId: "synthetic-community",
        userId: "synthetic-member",
        rejectionReason: "Fixture reason",
    });
});
