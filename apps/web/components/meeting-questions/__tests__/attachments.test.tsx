import { act, renderHook, waitFor } from "@testing-library/react";
import type { MeetingQuestionSet } from "@courselit/common-models";
import "next/dist/compiled/css.escape";
import { useAttachments } from "../use-attachments";

const nativeId = "-Zkk_c_EU8FAbdKKlyLW4";
const questionSet: MeetingQuestionSet = {
    id: "meeting",
    title: "Meeting",
    intro: "",
    revision: 1,
    updatedAt: "2026-09-15T00:00:00Z",
    questions: [
        {
            id: "q01",
            number: 1,
            title: "Membership",
            group: "start",
            context: "Discuss this section",
            candidateGroups: [],
            locations: [
                { path: "/", componentId: nativeId, label: "Membership" },
            ],
        },
    ],
};
const sets = [questionSet];
let page: HTMLElement;
let widget: HTMLElement;
beforeEach(() => {
    page = document.createElement("main");
    widget = document.createElement("section");
    widget.dataset.feedbackId = nativeId;
    widget.textContent = "Original page content";
    page.append(widget);
    document.body.append(page);
});
afterEach(() => page.remove());

test("finds literal native IDs only on their configured page without changing page nodes", () => {
    const { result, rerender } = renderHook(
        ({ path }) => useAttachments(sets, path),
        {
            initialProps: { path: "/" },
        },
    );
    expect(result.current).toHaveLength(1);
    expect(result.current[0].element).toBe(widget);
    expect(widget.textContent).toBe("Original page content");
    rerender({ path: "/different" });
    expect(result.current).toEqual([]);
});

test("removal and undo on an existing section update attachments without a child-list change", async () => {
    const { result } = renderHook(() => useAttachments(sets, "/"));
    expect(result.current).toHaveLength(1);
    await act(async () => widget.setAttribute("data-kk-section-removed", ""));
    await waitFor(() => expect(result.current).toEqual([]));
    await act(async () => widget.removeAttribute("data-kk-section-removed"));
    await waitFor(() => expect(result.current[0]?.element).toBe(widget));
    await act(async () => page.setAttribute("hidden", ""));
    await waitFor(() => expect(result.current).toEqual([]));
    await act(async () => page.removeAttribute("hidden"));
    await waitFor(() => expect(result.current[0]?.element).toBe(widget));
});

test("page replacement reattaches to the new React-owned node and ignores feedback UI", async () => {
    const { result, unmount } = renderHook(() => useAttachments(sets, "/"));
    const replacement = widget.cloneNode(true) as HTMLElement;
    await act(async () => widget.replaceWith(replacement));
    await waitFor(() => expect(result.current[0]?.element).toBe(replacement));
    expect(widget.isConnected).toBe(false);
    expect(replacement.textContent).toBe("Original page content");
    await act(async () => {
        replacement.remove();
        const control = document.createElement("aside");
        control.dataset.feedbackUi = "";
        control.append(widget);
        page.append(control);
    });
    await waitFor(() => expect(result.current).toEqual([]));
    unmount();
    expect(page.textContent).toBe("Original page content");
});
