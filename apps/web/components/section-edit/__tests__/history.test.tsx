import React from "react";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { SectionHistory } from "../history";
import { fetchSectionHistory } from "../api";
import { removal } from "./fixtures";

jest.mock("../api", () => ({ fetchSectionHistory: jest.fn() }));
const props = () => ({
    pageId: "home",
    userId: "admin",
    refreshKey: 1,
    currentIds: [] as string[],
    onRestore: jest.fn().mockResolvedValue(removal),
});
beforeEach(() => {
    jest.resetAllMocks();
});

test("History restores a complete removed section with explicit Enter activation", async () => {
    (fetchSectionHistory as jest.Mock).mockResolvedValue({
        edits: [removal],
        nextCursor: null,
    });
    const options = props();
    render(<SectionHistory {...options} />);
    const restore = await screen.findByRole("button", {
        name: /Restore section/,
    });
    expect(restore).not.toHaveAttribute("aria-keyshortcuts");
    expect(restore).not.toHaveTextContent("↵");
    fireEvent.click(restore);
    await waitFor(() =>
        expect(options.onRestore).toHaveBeenCalledWith(removal),
    );
    expect(
        screen.getByRole("heading", {
            level: 3,
            name: "Sections on this page",
        }),
    ).toBeInTheDocument();
});

test("present sections have an explained disabled action and restore rows are descriptive only", async () => {
    (fetchSectionHistory as jest.Mock).mockResolvedValue({
        edits: [removal, { ...removal, editId: "restore", action: "restore" }],
        nextCursor: null,
    });
    render(<SectionHistory {...props()} currentIds={["hero"]} />);
    expect(
        await screen.findByRole("button", { name: "Section is on the page" }),
    ).toBeDisabled();
    expect(screen.getAllByRole("button")).toHaveLength(1);
});

test("failed history reads can be retried and pagination retains only distinct rows", async () => {
    (fetchSectionHistory as jest.Mock).mockRejectedValueOnce(
        new Error("network"),
    );
    const old = { ...removal, editId: "old", label: "Earlier" };
    (fetchSectionHistory as jest.Mock).mockResolvedValueOnce({
        edits: [removal],
        nextCursor: "earlier",
    });
    (fetchSectionHistory as jest.Mock).mockResolvedValueOnce({
        edits: [removal, old],
        nextCursor: null,
    });
    render(<SectionHistory {...props()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    fireEvent.click(
        await screen.findByRole("button", {
            name: "Show earlier section changes",
        }),
    );
    await waitFor(() =>
        expect(screen.getAllByRole("listitem")).toHaveLength(2),
    );
    expect(fetchSectionHistory).toHaveBeenLastCalledWith("home", "earlier");
});

test("a slow earlier-page response cannot replace another route's history", async () => {
    let finish!: (value: unknown) => void;
    (fetchSectionHistory as jest.Mock).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const { rerender } = render(<SectionHistory {...props()} />);
    (fetchSectionHistory as jest.Mock).mockResolvedValue({
        edits: [],
        nextCursor: null,
    });
    rerender(<SectionHistory {...props()} pageId="other" />);
    await screen.findByText("No sections have been removed on this page yet.");
    await act(async () => {
        finish({ edits: [removal], nextCursor: null });
    });
    expect(screen.queryByText("Welcome")).toBeNull();
});
