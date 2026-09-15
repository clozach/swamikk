import { act, renderHook, waitFor } from "@testing-library/react";
import type { MeetingQuestionsSnapshot } from "@courselit/common-models";
import { useQuestions } from "../use-questions";
import { loadMeetingQuestions } from "../api";
import { ProfileContext } from "@components/contexts";
import { useMemberMimic } from "@/components/member-mimic/context";

jest.mock("../api", () => ({ loadMeetingQuestions: jest.fn() }));
jest.mock("@courselit/utils", () => ({ checkPermission: () => true }));
jest.mock("@/components/member-mimic/context", () => ({
    useMemberMimic: jest.fn(() => ({ kind: "inactive" })),
}));
const snapshot = (userId = "alice"): MeetingQuestionsSnapshot => ({
    viewer: { userId, name: userId },
    sets: [],
    answers: [],
});
let user: string | null = "alice";
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ProfileContext.Provider
        value={{
            profile: user ? { userId: user, permissions: [] } : null,
            setProfile: jest.fn(),
        }}
    >
        {children}
    </ProfileContext.Provider>
);
beforeEach(() => {
    jest.clearAllMocks();
    user = "alice";
    (loadMeetingQuestions as jest.Mock).mockResolvedValue(snapshot());
    (useMemberMimic as jest.Mock).mockReturnValue({ kind: "inactive" });
});
afterEach(() => jest.useRealTimers());

test("an old account response cannot populate the next account or logout", async () => {
    let finish!: (value: unknown) => void;
    (loadMeetingQuestions as jest.Mock).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const view = renderHook(useQuestions, { wrapper });
    user = "bob";
    (loadMeetingQuestions as jest.Mock).mockResolvedValue(snapshot("bob"));
    view.rerender();
    await waitFor(() =>
        expect(view.result.current.state).toEqual({
            kind: "ready",
            data: snapshot("bob"),
        }),
    );
    await act(async () => {
        finish(snapshot("alice"));
    });
    expect(view.result.current.state).toEqual({
        kind: "ready",
        data: snapshot("bob"),
    });
    user = null;
    view.rerender();
    expect(view.result.current.state.kind).toBe("restricted");
});

test("global and all-questions mounts share one in-flight read", async () => {
    let finish!: (value: unknown) => void;
    (loadMeetingQuestions as jest.Mock).mockImplementation(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const first = renderHook(useQuestions, { wrapper });
    const second = renderHook(useQuestions, { wrapper });
    expect(loadMeetingQuestions).toHaveBeenCalledTimes(1);
    await act(async () => {
        finish(snapshot());
    });
    expect(first.result.current.state.kind).toBe("ready");
    expect(second.result.current.state.kind).toBe("ready");
});

test("failed refresh keeps loaded answers available", async () => {
    const view = renderHook(useQuestions, { wrapper });
    await waitFor(() => expect(view.result.current.state.kind).toBe("ready"));
    (loadMeetingQuestions as jest.Mock).mockRejectedValue(new Error("Offline"));
    await act(async () => {
        await view.result.current.refresh();
    });
    expect(view.result.current.state).toMatchObject({
        kind: "ready",
        data: snapshot(),
        refreshError: "Offline",
    });
});

test("refreshes every 15 seconds and on focus only while the page is visible", async () => {
    jest.useFakeTimers();
    let visible = "visible";
    const visibility = jest
        .spyOn(document, "visibilityState", "get")
        .mockImplementation(() => visible as DocumentVisibilityState);
    const view = renderHook(useQuestions, { wrapper });
    await act(async () => {});
    expect(view.result.current.state.kind).toBe("ready");
    await act(async () => {
        jest.advanceTimersByTime(15_000);
    });
    expect(loadMeetingQuestions).toHaveBeenCalledTimes(2);
    visible = "hidden";
    await act(async () => {
        jest.advanceTimersByTime(30_000);
        window.dispatchEvent(new Event("focus"));
    });
    expect(loadMeetingQuestions).toHaveBeenCalledTimes(2);
    visible = "visible";
    await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(loadMeetingQuestions).toHaveBeenCalledTimes(3);
    await act(async () => {
        window.dispatchEvent(new Event("focus"));
    });
    expect(loadMeetingQuestions).toHaveBeenCalledTimes(4);
    view.unmount();
    await act(async () => {
        jest.advanceTimersByTime(15_000);
    });
    expect(loadMeetingQuestions).toHaveBeenCalledTimes(4);
    visibility.mockRestore();
});

test("server revocation clears previously loaded data", async () => {
    const view = renderHook(useQuestions, { wrapper });
    await waitFor(() => expect(view.result.current.state.kind).toBe("ready"));
    (loadMeetingQuestions as jest.Mock).mockRejectedValue(
        Object.assign(new Error("No longer allowed"), { status: 403 }),
    );
    await act(async () => {
        await view.result.current.refresh();
    });
    expect(view.result.current.state).toEqual({ kind: "restricted" });
});

test("a response received after logout or entering Mimic remains inaccessible", async () => {
    let finish!: (value: unknown) => void;
    (loadMeetingQuestions as jest.Mock).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const view = renderHook(useQuestions, { wrapper });
    user = null;
    view.rerender();
    await act(async () => {
        finish(snapshot());
    });
    expect(view.result.current.state).toEqual({ kind: "restricted" });
    user = "alice";
    (useMemberMimic as jest.Mock).mockReturnValue({ kind: "active" });
    view.rerender();
    expect(view.result.current.permitted).toBe(false);
    expect(view.result.current.state).toEqual({ kind: "restricted" });
});

test("a response bearing a different authenticated viewer is rejected", async () => {
    (loadMeetingQuestions as jest.Mock).mockResolvedValue(snapshot("bob"));
    const view = renderHook(useQuestions, { wrapper });
    await waitFor(() =>
        expect(view.result.current.state).toEqual({ kind: "restricted" }),
    );
});
