import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { usePathname } from "next/navigation";
import type { MemberMimicView } from "@courselit/common-models";
import { memberMimicUi as copy } from "@/config/strings";
import MemberMimicProvider from "../provider";
import { HideDuringMimic } from "../context";

jest.mock("next/navigation", () => ({ usePathname: jest.fn() }));

const originalLocation = Object.getOwnPropertyDescriptor(window, "location")!;
const originalFetch = global.fetch;
const mockFetch = jest.fn();
const mockReplace = jest.fn();
const memberRendered = jest.fn();
const privateRendered = jest.fn();
let active: MemberMimicView;

function MemberContent() {
    memberRendered();
    return <p>Published member lesson</p>;
}

function PrivateContent() {
    privateRendered();
    return <p>Private practice history and drafts</p>;
}

function mount(initialView: MemberMimicView = active, href?: string) {
    return render(
        <MemberMimicProvider initialView={initialView}>
            <MemberContent />
            <HideDuringMimic>
                <PrivateContent />
            </HideDuringMimic>
            {href && (
                <a href={href}>
                    <span>Follow this link</span>
                </a>
            )}
        </MemberMimicProvider>,
    );
}

function response(mimic: MemberMimicView) {
    return { ok: true, json: async () => ({ mimic }) };
}

function deferredResponse() {
    let resolve!: (value: ReturnType<typeof response>) => void;
    const promise = new Promise<ReturnType<typeof response>>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch;
    jest.mocked(usePathname).mockReturnValue("/dashboard/profile");
    Object.defineProperty(window, "location", {
        configurable: true,
        value: {
            href: "http://localhost/dashboard/profile",
            origin: "http://localhost",
            replace: mockReplace,
        },
    });
    delete document.documentElement.dataset.memberMimicSuspended;
    active = {
        kind: "active",
        actor: {
            userId: "admin",
            name: "Administrator",
            email: "admin@example.com",
        },
        subject: {
            userId: "member",
            name: "Member",
            email: "member@example.com",
        },
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        returnTo: "/dashboard/users?page=2",
    };
});

afterEach(() => {
    cleanup();
    jest.useRealTimers();
    Object.defineProperty(window, "location", originalLocation);
    global.fetch = originalFetch;
    delete document.documentElement.dataset.memberMimicSuspended;
});

test("verifies before mounting member content and keeps private children unmounted behind the marked read-only view", async () => {
    const pending = deferredResponse();
    mockFetch.mockReturnValueOnce(pending.promise);
    const { container } = mount();

    expect(screen.getByText(copy.verifying)).toBeInTheDocument();
    expect(memberRendered).not.toHaveBeenCalled();
    expect(privateRendered).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith("/api/member-mimic", {
        cache: "no-store",
        credentials: "same-origin",
    });

    await act(async () => {
        pending.resolve(response(active));
    });

    expect(screen.getByText("Published member lesson")).toBeInTheDocument();
    expect(
        screen.getByRole("complementary", { name: copy.title }),
    ).toHaveTextContent("Member");
    expect(screen.getByText(copy.readOnly)).toBeInTheDocument();
    expect(container.querySelector(".kk-mimic-watermark")).toHaveAttribute(
        "aria-hidden",
        "true",
    );
    expect(container.querySelector(".kk-mimic-content")).toHaveClass(
        "kk-mimic-spacing",
    );
    expect(privateRendered).not.toHaveBeenCalled();
});

test.each(["inactive", "active"] as const)(
    "fails closed when initial verification fails from %s",
    async (kind) => {
        mockFetch.mockRejectedValueOnce(new Error("Offline"));
        mount(kind === "active" ? active : { kind: "inactive" });

        expect(
            await screen.findByRole("button", { name: copy.retry }),
        ).toBeInTheDocument();
        expect(memberRendered).not.toHaveBeenCalled();
        expect(privateRendered).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
    },
);

test.each([
    { name: "Member", expected: "Viewing as Member (member@example.com)" },
    { name: "member@example.com", expected: "Viewing as member@example.com" },
])(
    "shows the subject email only once when the display name is $name",
    async ({ name, expected }) => {
        if (active.kind !== "active") throw new Error("Expected active view");
        active.subject.name = name;
        mockFetch.mockResolvedValueOnce(response(active));
        mount();
        await screen.findByText("Published member lesson");

        const banner = screen.getByRole("complementary", { name: copy.title });
        expect(banner).toHaveTextContent(expected);
        expect(banner.textContent?.match(/member@example\.com/g)).toHaveLength(
            1,
        );
        expect(privateRendered).not.toHaveBeenCalled();
    },
);

test("allows My content navigation while preserving the private-data mask", async () => {
    mockFetch.mockResolvedValueOnce(response(active));
    mount(active, "/dashboard/my-content");
    const target = await screen.findByText("Follow this link");
    let blockedByMimic: boolean | undefined;
    document.addEventListener(
        "click",
        (event) => {
            blockedByMimic = event.defaultPrevented;
            // Prevent jsdom navigation after observing the provider's capture handler.
            event.preventDefault();
        },
        { once: true },
    );

    fireEvent.click(target);

    expect(blockedByMimic).toBe(false);
    expect(screen.queryByText(copy.outsideHelp)).not.toBeInTheDocument();
    expect(screen.getByText(copy.readOnly)).toBeInTheDocument();
    expect(privateRendered).not.toHaveBeenCalled();
});

test("an external arrival with inactive server state redirects to the verified subject without mounting an unlabelled child", async () => {
    const pending = deferredResponse();
    mockFetch.mockReturnValueOnce(pending.promise);
    mount({ kind: "inactive" });
    expect(memberRendered).not.toHaveBeenCalled();

    await act(async () => {
        pending.resolve(response(active));
    });

    expect(mockReplace).toHaveBeenCalledWith("/dashboard/profile");
    expect(memberRendered).not.toHaveBeenCalled();
    expect(privateRendered).not.toHaveBeenCalled();
    expect(screen.getByText(copy.verifying)).toBeInTheDocument();
});

test("an expired view never mounts member or private children", async () => {
    const expired: MemberMimicView = {
        kind: "expired",
        returnTo: "/dashboard/users",
    };
    mockFetch.mockResolvedValueOnce(response(expired));
    mount(expired);

    expect(
        await screen.findByRole("heading", { name: copy.expired }),
    ).toBeInTheDocument();
    expect(memberRendered).not.toHaveBeenCalled();
    expect(privateRendered).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: copy.exit })).toBeEnabled();
});

test("expiry removes an already mounted member lesson", async () => {
    jest.useFakeTimers();
    active = {
        ...active,
        expiresAt: new Date(Date.now() + 1000).toISOString(),
    } as MemberMimicView;
    mockFetch.mockResolvedValueOnce(response(active));
    mount();
    await act(async () => {});
    expect(screen.getByText("Published member lesson")).toBeInTheDocument();

    act(() => {
        jest.advanceTimersByTime(1001);
    });

    expect(
        screen.getByRole("heading", { name: copy.expired }),
    ).toBeInTheDocument();
    expect(
        screen.queryByText("Published member lesson"),
    ).not.toBeInTheDocument();
    expect(privateRendered).not.toHaveBeenCalled();
});

test("back-forward restoration masks the snapshot and revalidates before remounting member content", async () => {
    mockFetch.mockResolvedValueOnce(response(active));
    mount();
    await screen.findByText("Published member lesson");
    const pending = deferredResponse();
    mockFetch.mockReturnValueOnce(pending.promise);

    fireEvent(window, new PageTransitionEvent("pagehide", { persisted: true }));
    expect(document.documentElement.dataset.memberMimicSuspended).toBe("true");
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    expect(
        screen.queryByText("Published member lesson"),
    ).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await act(async () => {
        pending.resolve(response(active));
    });

    expect(
        document.documentElement.dataset.memberMimicSuspended,
    ).toBeUndefined();
    expect(screen.getByText("Published member lesson")).toBeInTheDocument();
    expect(privateRendered).not.toHaveBeenCalled();
});

test("a failed refresh hides previously mounted member content until a successful retry", async () => {
    mockFetch.mockResolvedValueOnce(response(active));
    mount();
    await screen.findByText("Published member lesson");
    mockFetch.mockRejectedValueOnce(new Error("Connection lost"));

    fireEvent.focus(window);

    expect(
        await screen.findByRole("button", { name: copy.retry }),
    ).toBeInTheDocument();
    expect(
        screen.queryByText("Published member lesson"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(copy.readOnly)).toBeInTheDocument();
    mockFetch.mockResolvedValueOnce(response(active));
    fireEvent.click(screen.getByRole("button", { name: copy.retry }));
    await screen.findByText("Published member lesson");
    expect(privateRendered).not.toHaveBeenCalled();
});

test("failed Exit retains the read-only banner and private-data mask without navigating into the actor view", async () => {
    mockFetch.mockResolvedValueOnce(response(active));
    mount();
    await screen.findByText("Published member lesson");
    const pending = deferredResponse();
    mockFetch.mockReturnValueOnce(pending.promise);

    fireEvent.click(screen.getByRole("button", { name: copy.exit }));
    expect(
        screen.queryByText("Published member lesson"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.exiting })).toBeDisabled();
    await act(async () => {
        pending.resolve({ ok: false } as ReturnType<typeof response>);
    });

    expect(screen.getByText(copy.exitFailed)).toBeInTheDocument();
    expect(screen.getByText(copy.readOnly)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.exit })).toBeEnabled();
    expect(mockFetch).toHaveBeenLastCalledWith("/api/member-mimic", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(privateRendered).not.toHaveBeenCalled();
});

test.each([
    "/dashboard/users",
    "/checkout",
    "/course/practice/course-1/discussions",
    "https://outside.example/",
])("blocks literal navigation to %s", async (href) => {
    mockFetch.mockResolvedValueOnce(response(active));
    mount(active, href);
    const target = await screen.findByText("Follow this link");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });

    act(() => {
        target.dispatchEvent(click);
    });

    expect(click.defaultPrevented).toBe(true);
    expect(screen.getByText(copy.outsideHelp)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(privateRendered).not.toHaveBeenCalled();
});

test("an unsafe deep-link path is blocked before member children mount", async () => {
    jest.mocked(usePathname).mockReturnValue("/dashboard/users");
    mockFetch.mockResolvedValueOnce(response(active));
    mount();

    await waitFor(() =>
        expect(
            screen.getByRole("heading", { name: copy.outside }),
        ).toBeInTheDocument(),
    );
    expect(memberRendered).not.toHaveBeenCalled();
    expect(privateRendered).not.toHaveBeenCalled();
});
