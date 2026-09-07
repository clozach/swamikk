import React, { useContext } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProfilePage from "../page";
import { AddressContext, ProfileContext } from "@components/contexts";
import Layout from "@/app/(with-contexts)/layout-with-context";
import { defaultState } from "@components/default-state";
import { getUserProfile } from "@/app/(with-contexts)/helpers";
import { authClient } from "@/lib/auth-client";

const mockToast = jest.fn();
const mockExec = jest.fn();
const mockSetProfile = jest.fn();
const mockClosureFetch = jest.fn();
const originalFetch = global.fetch;

jest.mock("@/app/(with-contexts)/helpers", () => ({
    getUserProfile: jest.fn(),
}));
jest.mock("@components/next-theme-provider", () => ({
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@components/notifications-viewer", () => ({
    NotificationsViewer: () => null,
}));
jest.mock("@components/admin/dashboard-skeleton/nav-user", () => ({
    NavUser: () => null,
}));
jest.mock("@components/admin/next-theme-switcher", () => ({
    __esModule: true,
    default: () => null,
}));

// Identity-provider behavior and private preferences have their own suites.
// Keep this legacy profile-details test independent of the ESM auth client.
jest.mock("@/lib/auth-client", () => ({ authClient: { signOut: jest.fn() } }));
jest.mock("@/components/contact-preferences/panel", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("@courselit/components-library", () => ({
    Toaster: () => null,
    Skeleton: () => <div role="status">Loading profile</div>,
    Avatar: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    AvatarFallback: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    AvatarImage: ({ src }: { src?: string }) => <img alt="" src={src} />,
    Checkbox: ({
        checked,
        onChange,
    }: {
        checked: boolean;
        onChange: (value: boolean) => void;
    }) => (
        <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
        />
    ),
    Image: ({ alt, src }: { alt: string; src: string }) => (
        <img alt={alt} src={src} />
    ),
    MediaSelector: () => null,
    useToast: () => ({
        toast: mockToast,
    }),
}));

jest.mock("@components/ui/field", () => ({
    Field: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    FieldContent: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    FieldGroup: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    FieldLabel: ({
        children,
        htmlFor,
    }: {
        children: React.ReactNode;
        htmlFor?: string;
    }) => <label htmlFor={htmlFor}>{children}</label>,
    FieldLegend: ({ children }: { children: React.ReactNode }) => (
        <legend>{children}</legend>
    ),
    FieldSet: ({ children }: { children: React.ReactNode }) => (
        <fieldset>{children}</fieldset>
    ),
}));

jest.mock("@components/ui/card", () => ({
    Card: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    CardContent: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    CardHeader: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    CardTitle: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));

jest.mock("@components/ui/input", () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
        <input {...props} />
    ),
}));

jest.mock("@components/ui/textarea", () => ({
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
        <textarea {...props} />
    ),
}));

jest.mock("@components/ui/button", () => ({
    Button: ({
        children,
        ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...props}>{children}</button>
    ),
}));

jest.mock("@courselit/utils", () => ({
    checkPermission: () => false,
    FetchBuilder: jest.fn().mockImplementation(() => ({
        setUrl: jest.fn().mockReturnThis(),
        setPayload: jest.fn().mockReturnThis(),
        setIsGraphQLEndpoint: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnThis(),
        exec: mockExec,
    })),
}));

function ProfileProbe() {
    const { profile } = useContext(ProfileContext);
    return (
        <output data-testid="profile-state">{JSON.stringify(profile)}</output>
    );
}

function CompletionJourney({ signedIn = true }: { signedIn?: boolean }) {
    return (
        <Layout
            address="http://localhost:3000"
            siteinfo={defaultState.siteinfo}
            theme={defaultState.theme}
            config={defaultState.config}
            features={[]}
            session={signedIn ? ({ user: { id: "user-1" } } as any) : null}
        >
            <ProfileProbe />
            <ProfilePage />
        </Layout>
    );
}

function renderPage() {
    return render(
        <AddressContext.Provider
            value={{
                backend: "http://localhost:3000",
                frontend: "http://localhost:3000",
            }}
        >
            <ProfileContext.Provider
                value={{
                    profile: {
                        userId: "user-1",
                        name: "Jane Doe",
                        email: "jane@example.com",
                        bio: "Old bio",
                        permissions: [],
                        purchases: [],
                        fetched: true,
                        subscribedToUpdates: false,
                        avatar: {
                            thumbnail: "old-avatar.png",
                        },
                    },
                    setProfile: mockSetProfile,
                }}
            >
                <ProfilePage />
            </ProfileContext.Provider>
        </AddressContext.Provider>,
    );
}

describe("ProfilePage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockReset();
        mockClosureFetch.mockReset();
        global.fetch = mockClosureFetch;
        jest.mocked(authClient.signOut).mockReset().mockResolvedValue({});
        jest.mocked(getUserProfile).mockResolvedValue({
            ...defaultState.profile,
            fetched: true,
            userId: "user-1",
            name: "Jane Doe",
            email: "jane@example.com",
        });
        mockExec
            .mockResolvedValueOnce({
                user: {
                    name: "Jane Doe",
                    bio: "Old bio",
                    email: "jane@example.com",
                    subscribedToUpdates: false,
                    avatar: {
                        thumbnail: "old-avatar.png",
                    },
                },
            })
            .mockResolvedValueOnce({
                user: {
                    id: "db-user-1",
                    name: "Jane Updated",
                    userId: "user-1",
                    email: "jane@example.com",
                    permissions: [],
                    purchases: [],
                    bio: "Old bio",
                    avatar: {
                        thumbnail: "old-avatar.png",
                    },
                },
            });
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it.each(["success", "failure"])(
        "keeps closure confirmation visible with a real guest transition after sign-out %s",
        async (signOutResult) => {
            if (signOutResult === "failure")
                jest.mocked(authClient.signOut).mockRejectedValueOnce(
                    new Error("offline"),
                );
            mockClosureFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        kind: "review",
                        blockers: [],
                        recentIdentity: true,
                        pendingWrites: 0,
                        state: "active",
                        reviewHash: "reviewed-closure",
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ kind: "closed" }),
                });
            const view = render(<CompletionJourney />);
            fireEvent.click(
                await screen.findByRole("button", {
                    name: "Review account closure",
                }),
            );
            fireEvent.change(
                await screen.findByLabelText(
                    "Type CLOSE to permanently close this account",
                ),
                { target: { value: "CLOSE" } },
            );
            fireEvent.click(
                screen.getByRole("button", {
                    name: "Permanently close my account",
                }),
            );

            const heading = await screen.findByRole("heading", {
                name: "Your account is closed",
            });
            await waitFor(() => expect(heading).toHaveFocus());
            expect(
                JSON.parse(screen.getByTestId("profile-state").textContent!),
            ).toEqual({ ...defaultState.profile, fetched: true });
            expect(
                screen.getByRole("link", { name: "Return home" }),
            ).toHaveAttribute("href", "/");
            expect(
                screen.getByText(/Your private account data has been removed/),
            ).toBeVisible();
            expect(
                screen.queryByRole("button", {
                    name: "Review account closure",
                }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole("button", { name: "Save" }),
            ).not.toBeInTheDocument();
            expect(mockClosureFetch.mock.calls[1][1]).toMatchObject({
                method: "DELETE",
                body: JSON.stringify({
                    reviewHash: "reviewed-closure",
                    confirmation: "CLOSE",
                }),
            });
            await waitFor(() =>
                expect(authClient.signOut).toHaveBeenCalledTimes(1),
            );

            // A subsequent session refresh must retain the completion view too.
            view.rerender(<CompletionJourney signedIn={false} />);
            expect(
                screen.getByRole("heading", { name: "Your account is closed" }),
            ).toBeVisible();
            expect(
                screen.queryByText("Loading profile"),
            ).not.toBeInTheDocument();
        },
    );

    it("keeps the member identity and recovery message when closure is not confirmed", async () => {
        mockClosureFetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    kind: "review",
                    blockers: [],
                    recentIdentity: true,
                    pendingWrites: 0,
                    state: "active",
                    reviewHash: "reviewed-closure",
                }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: async () => ({
                    error: {
                        message: "Closure needs recovery. Contact support.",
                    },
                }),
            });
        render(<CompletionJourney />);
        fireEvent.click(
            await screen.findByRole("button", {
                name: "Review account closure",
            }),
        );
        fireEvent.change(
            await screen.findByLabelText(
                "Type CLOSE to permanently close this account",
            ),
            { target: { value: "CLOSE" } },
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: "Permanently close my account",
            }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Closure needs recovery.",
        );
        expect(
            JSON.parse(screen.getByTestId("profile-state").textContent!).userId,
        ).toBe("user-1");
        expect(
            screen.queryByRole("heading", { name: "Your account is closed" }),
        ).not.toBeInTheDocument();
        expect(authClient.signOut).not.toHaveBeenCalled();
    });

    it("preserves fetched profile state after saving details", async () => {
        renderPage();

        const nameInput = await screen.findByDisplayValue("Jane Doe");
        fireEvent.change(nameInput, {
            target: {
                value: "Jane Updated",
            },
        });

        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(mockSetProfile).toHaveBeenCalledTimes(1);
        });

        const updater = mockSetProfile.mock.calls[0][0];
        expect(typeof updater).toBe("function");

        expect(
            updater({
                userId: "user-1",
                name: "Jane Doe",
                email: "jane@example.com",
                bio: "Old bio",
                permissions: [],
                purchases: [],
                fetched: true,
                subscribedToUpdates: false,
                avatar: {
                    thumbnail: "old-avatar.png",
                },
            }),
        ).toMatchObject({
            userId: "user-1",
            name: "Jane Updated",
            email: "jane@example.com",
            bio: "Old bio",
            fetched: true,
            subscribedToUpdates: false,
        });
    });
});
