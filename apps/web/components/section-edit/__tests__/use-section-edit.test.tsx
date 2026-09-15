import { act, renderHook, waitFor } from "@testing-library/react";
import { useSectionEdit } from "../use-section-edit";
import { fetchSections, submitSectionEdit } from "../api";
import { page, removedPage, removal } from "./fixtures";

jest.mock("../api", () => ({
    fetchSections: jest.fn(),
    submitSectionEdit: jest.fn(),
}));
const options = () => ({
    onApplied: jest.fn(),
    onError: jest.fn(),
    onRefresh: jest.fn(),
});
beforeEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        value: jest.fn(() => "request-id"),
    });
    (fetchSections as jest.Mock).mockResolvedValue(page);
});

test("removal records one durable edit and rejects simultaneous clicks", async () => {
    let finish!: (value: unknown) => void;
    (submitSectionEdit as jest.Mock).mockImplementation(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const handlers = options();
    const { result } = renderHook(() => useSectionEdit("home", handlers));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    let first!: Promise<unknown>;
    act(() => {
        first = result.current.remove(page.sections[0]);
        void result.current.remove(page.sections[0]);
    });
    expect(submitSectionEdit).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toEqual({
        kind: "saving",
        widgetId: "hero",
        action: "remove",
    });
    (fetchSections as jest.Mock).mockResolvedValue(removedPage);
    await act(async () => {
        finish({ kind: "applied", edit: removal });
        await first;
    });
    expect(handlers.onApplied).toHaveBeenCalledWith(removal);
    expect(handlers.onApplied).toHaveBeenCalledTimes(1);
    expect(result.current.pending.kind).toBe("idle");
});

test("a saved change stays in the journal when metadata and rendering refresh fail", async () => {
    const handlers = options();
    handlers.onRefresh.mockRejectedValue(new Error("render failed"));
    const { result } = renderHook(() => useSectionEdit("home", handlers));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    (fetchSections as jest.Mock).mockRejectedValue(
        new Error("metadata failed"),
    );
    (submitSectionEdit as jest.Mock).mockResolvedValue({
        kind: "applied",
        edit: removal,
    });
    let saved;
    await act(async () => {
        saved = await result.current.remove(page.sections[0]);
    });
    expect(saved).toEqual(removal);
    expect(handlers.onApplied).toHaveBeenCalledWith(removal);
    expect(handlers.onError).toHaveBeenCalled();
    expect(result.current.state.kind).toBe("ready");
    if (result.current.state.kind === "ready")
        expect(result.current.state.page.removed).toEqual([removal]);
    expect(result.current.pending.kind).toBe("idle");
});

test("the shared journal's reversal returns its receipt without creating a second new action", async () => {
    (fetchSections as jest.Mock).mockResolvedValue(removedPage);
    const handlers = options();
    const { result } = renderHook(() => useSectionEdit("home", handlers));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    const restored = { ...removal, editId: "restored", action: "restore" };
    (submitSectionEdit as jest.Mock).mockResolvedValue({
        kind: "applied",
        edit: restored,
    });
    (fetchSections as jest.Mock).mockResolvedValue(page);
    let saved;
    await act(async () => {
        saved = await result.current.reverse(removal);
    });
    expect(saved).toEqual(restored);
    expect(handlers.onApplied).not.toHaveBeenCalled();
    expect(submitSectionEdit).toHaveBeenCalledWith({
        action: "reverse",
        requestId: "request-id",
        editId: removal.editId,
    });
});

test("stale concurrent changes refresh metadata and leave the journal untouched", async () => {
    const handlers = options();
    const { result } = renderHook(() => useSectionEdit("home", handlers));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    const changed = {
        ...page,
        revision: 2,
        sections: [
            { ...page.sections[0], fingerprint: "new-version" },
            page.sections[1],
        ],
    };
    (fetchSections as jest.Mock).mockResolvedValue(changed);
    (submitSectionEdit as jest.Mock).mockResolvedValue({
        kind: "stale",
        message: "Changed elsewhere",
    });
    await act(async () => {
        await result.current.remove(page.sections[0]);
    });
    expect(handlers.onApplied).not.toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalledWith("Changed elsewhere");
    expect(result.current.state).toEqual({ kind: "ready", page: changed });
});

test("active text editing can prevent removal before any request or optimistic change", async () => {
    const handlers = { ...options(), beforeChange: () => false };
    const { result } = renderHook(() => useSectionEdit("home", handlers));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    await act(async () => {
        await result.current.remove(page.sections[0]);
    });
    expect(submitSectionEdit).not.toHaveBeenCalled();
    expect(result.current.pending.kind).toBe("idle");
});

test("a response for the previous route cannot populate the next route", async () => {
    let finish!: (value: unknown) => void;
    (fetchSections as jest.Mock).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const { result, rerender } = renderHook(
        ({ id }) => useSectionEdit(id, options()),
        { initialProps: { id: "home" } },
    );
    (fetchSections as jest.Mock).mockResolvedValue({
        ...page,
        pageId: "other",
    });
    rerender({ id: "other" });
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    await act(async () => {
        finish(page);
    });
    if (result.current.state.kind === "ready")
        expect(result.current.state.page.pageId).toBe("other");
});

test("a history action from another route cannot change that previous page", async () => {
    (fetchSections as jest.Mock).mockResolvedValue({
        ...page,
        pageId: "other",
    });
    const { result } = renderHook(() => useSectionEdit("other", options()));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    await act(async () => {
        await result.current.reverse(removal);
        await result.current.restore(removal);
    });
    expect(submitSectionEdit).not.toHaveBeenCalled();
});
