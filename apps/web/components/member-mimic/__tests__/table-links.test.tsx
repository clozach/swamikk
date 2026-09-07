import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";
import SubscribersView from "@/app/(with-contexts)/dashboard/(sidebar)/subscribers/subscribers-view";
import CohortPage from "@/app/(with-contexts)/dashboard/(sidebar)/cohorts/[id]/page";
import { ProfileContext, AddressContext } from "@/components/contexts";

const mockToast = jest.fn();
const mockExec = jest.fn();
const mockPayload = jest.fn();
let path = "/dashboard/subscribers";
const router = { push: jest.fn() };
jest.mock("next/navigation", () => ({
    usePathname: () => path,
    useRouter: () => router,
}));
jest.mock("@components/admin/dashboard-content", () => ({
    __esModule: true,
    default: ({ children }: any) => <>{children}</>,
}));
jest.mock("@courselit/components-library", () => ({
    useToast: () => ({ toast: mockToast }),
    Skeleton: () => null,
    Badge: ({ children }: any) => <span>{children}</span>,
    Select: () => null,
    TableBody: ({ children }: any) => <tbody>{children}</tbody>,
}));
jest.mock("@courselit/utils", () => ({
    ...jest.requireActual("@courselit/utils"),
    FetchBuilder: jest.fn().mockImplementation(() => ({
        setUrl: jest.fn().mockReturnThis(),
        setPayload: function (payload: unknown) {
            mockPayload(payload);
            return this;
        },
        setIsGraphQLEndpoint: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnThis(),
        exec: mockExec,
    })),
}));

async function mount(child: React.ReactNode) {
    await act(async () => {
        render(
            <AddressContext.Provider
                value={{ backend: "http://localhost" } as any}
            >
                <ProfileContext.Provider
                    value={
                        {
                            profile: {
                                userId: "admin",
                                permissions: [
                                    "user:manage",
                                    "course:manage_any",
                                ],
                            },
                        } as any
                    }
                >
                    <Suspense fallback={null}>{child}</Suspense>
                </ProfileContext.Provider>
            </AddressContext.Provider>,
        );
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

test("Subscribers links only the server-proven member and restores its page after Exit", async () => {
    path = "/dashboard/subscribers";
    window.history.replaceState(null, "", `${path}?page=3`);
    mockExec.mockResolvedValue({
        subscribers: [
            {
                userId: "member",
                email: "member@example.com",
                linkedMemberId: "member",
            },
            {
                userId: "lead",
                email: "newsletter@example.com",
                linkedMemberId: null,
            },
        ],
    });
    await mount(<SubscribersView />);
    const member = screen.getByRole("link", { name: "member@example.com" });
    const url = new URL(member.getAttribute("href")!, window.location.origin);
    expect(url.pathname).toBe("/dashboard/users/member");
    expect(url.searchParams.get("returnTo")).toBe(
        "/dashboard/subscribers?page=3",
    );
    expect(screen.getByText("newsletter@example.com").closest("a")).toBeNull();
    expect(mockPayload).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { page: 3, limit: 50 } }),
    );
});

test("the actual cohort roster enters the same member page and retains its source cohort", async () => {
    path = "/dashboard/cohorts/cohort-one";
    window.history.replaceState(null, "", path);
    mockExec.mockResolvedValue({
        cohort: {
            cohortId: "cohort-one",
            name: "Class",
            courseId: "course",
            members: ["member"],
            schedule: {},
        },
        members: [
            {
                userId: "member",
                name: "Member One",
                email: "member@example.com",
            },
        ],
        products: [],
        courses: [],
        users: [],
    });
    await mount(<CohortPage params={Promise.resolve({ id: "cohort-one" })} />);
    const member = screen.getByRole("link", { name: "Member One" });
    const url = new URL(member.getAttribute("href")!, window.location.origin);
    expect(url.pathname).toBe("/dashboard/users/member");
    expect(url.searchParams.get("returnTo")).toBe(path);
    expect(
        mockPayload.mock.calls.every(
            ([payload]) => !String(payload.query).includes("mutation"),
        ),
    ).toBe(true);
});
