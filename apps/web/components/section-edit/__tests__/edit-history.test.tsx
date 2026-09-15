import { act, renderHook } from "@testing-library/react";
import { useEditHistory } from "../use-edit-history";

type Edit = { editId: string; kind: "text" | "section" };
const text: Edit = { editId: "heading", kind: "text" };
const section: Edit = { editId: "section", kind: "section" };
const inverse = (edit: Edit): Edit => ({
    ...edit,
    editId: `undo-${edit.editId}`,
});

it("undoes interleaved text and section edits in order, and redoes in reverse order", async () => {
    const reverse = jest.fn(async (edit: Edit) => inverse(edit));
    const { result } = renderHook(() => useEditHistory(reverse));
    act(() => {
        result.current.record(text);
        result.current.record(section);
    });
    await act(async () => {
        await result.current.undo();
    });
    await act(async () => {
        await result.current.undo();
    });
    expect(reverse.mock.calls.map(([edit]) => edit.editId)).toEqual([
        "section",
        "heading",
    ]);
    await act(async () => {
        await result.current.redo();
    });
    await act(async () => {
        await result.current.redo();
    });
    expect(reverse.mock.calls.map(([edit]) => edit.editId)).toEqual([
        "section",
        "heading",
        "undo-heading",
        "undo-section",
    ]);
});

it("keeps a refused undo available to retry and serializes repeated input", async () => {
    let settle!: (edit: Edit | null) => void;
    const reverse = jest.fn(
        () =>
            new Promise<Edit | null>((resolve) => {
                settle = resolve;
            }),
    );
    const { result } = renderHook(() => useEditHistory(reverse));
    act(() => result.current.record(section));
    let first!: Promise<Edit | null>;
    act(() => {
        first = result.current.undo();
    });
    await act(async () => {
        expect(await result.current.undo()).toBeNull();
    });
    expect(reverse).toHaveBeenCalledTimes(1);
    await act(async () => {
        settle(null);
        await first;
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    act(() => {
        first = result.current.undo();
    });
    await act(async () => {
        settle(inverse(section));
        await first;
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
});

it("keeps entries after a transport exception and clears redo when new work lands", async () => {
    const reverse = jest.fn(async (edit: Edit) => inverse(edit));
    reverse.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useEditHistory(reverse));
    act(() => result.current.record(text));
    await act(async () => {
        await expect(result.current.undo()).rejects.toThrow("offline");
    });
    expect(result.current.canUndo).toBe(true);
    await act(async () => {
        await result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.record(section));
    expect(result.current.canRedo).toBe(false);
});

it("an in-place undo reverses only its selected entry and preserves later edits", async () => {
    const reverse = jest.fn(async (edit: Edit) => inverse(edit));
    const { result } = renderHook(() => useEditHistory(reverse));
    act(() => {
        result.current.record(section);
        result.current.record(text);
    });
    await act(async () => {
        await result.current.reverseEntry(section);
    });
    await act(async () => {
        await result.current.undo();
    });
    expect(reverse.mock.calls.map(([edit]) => edit.editId)).toEqual([
        "section",
        "heading",
    ]);
});
