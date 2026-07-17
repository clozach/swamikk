import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import CohortsHub from "../cohorts-hub";
import { AddressContext, ProfileContext } from "@components/contexts";
import { UIConstants } from "@courselit/common-models";
import {
    COHORTS_LIST_EMPTY_TITLE,
    COHORTS_PAGE_HEADING,
} from "@ui-config/strings";

const mockToast = jest.fn();
const mockExec = jest.fn();

const mockDashboardContent = jest.fn(
    ({
        children,
        breadcrumbs,
        permissions,
    }: {
        children: React.ReactNode;
        breadcrumbs?: { label: string; href: string }[];
        permissions?: string[];
    }) => (
        <div>
            <div data-testid="breadcrumbs-json">
                {JSON.stringify(breadcrumbs || [])}
            </div>
            <div data-testid="permissions-json">
                {JSON.stringify(permissions || [])}
            </div>
            {children}
        </div>
    ),
);

jest.mock("@components/admin/dashboard-content", () => ({
    __esModule: true,
    default: (props: {
        children: React.ReactNode;
        breadcrumbs?: { label: string; href: string }[];
        permissions?: string[];
    }) => mockDashboardContent(props),
}));

jest.mock("@components/admin/loading-screen", () => ({
    __esModule: true,
    default: () => <div data-testid="loading-screen" />,
}));

jest.mock("@components/admin/empty-state", () => ({
    __esModule: true,
    default: ({
        title,
        description,
    }: {
        title: string;
        description?: string;
    }) => (
        <div>
            <div>{title}</div>
            <div>{description}</div>
        </div>
    ),
}));

jest.mock("next/link", () => ({
    __esModule: true,
    default: ({
        children,
        href,
    }: {
        children: React.ReactNode;
        href: string;
    }) => <a href={href}>{children}</a>,
}));

jest.mock("@courselit/components-library", () => ({
    Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
    TableBody: ({ children }: { children: React.ReactNode }) => (
        <tbody>{children}</tbody>
    ),
    Skeleton: () => <div data-testid="skeleton" />,
    useToast: () => ({
        toast: mockToast,
    }),
}));

jest.mock("@courselit/utils", () => {
    const actual = jest.requireActual("@courselit/utils");
    return {
        ...actual,
        FetchBuilder: jest.fn().mockImplementation(() => ({
            setUrl: jest.fn().mockReturnThis(),
            setPayload: jest.fn().mockReturnThis(),
            setIsGraphQLEndpoint: jest.fn().mockReturnThis(),
            build: jest.fn().mockReturnThis(),
            exec: mockExec,
        })),
    };
});

jest.mock("@ui-lib/utils", () => ({
    formattedLocaleDate: (epoch: number) => `date-${epoch}`,
}));

jest.mock(
    "@components/ui/table",
    () => ({
        Table: ({ children }: { children: React.ReactNode }) => (
            <table>{children}</table>
        ),
        TableHeader: ({ children }: { children: React.ReactNode }) => (
            <thead>{children}</thead>
        ),
        TableHead: ({ children }: { children: React.ReactNode }) => (
            <th>{children}</th>
        ),
        TableRow: ({ children }: { children: React.ReactNode }) => (
            <tr>{children}</tr>
        ),
        TableCell: ({ children }: { children: React.ReactNode }) => (
            <td>{children}</td>
        ),
    }),
    { virtual: true },
);

jest.mock(
    "@components/ui/button",
    () => ({
        Button: ({
            children,
            ...props
        }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
            <button {...props}>{children}</button>
        ),
    }),
    { virtual: true },
);

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
                        permissions: [UIConstants.permissions.manageUsers],
                    },
                    setProfile: jest.fn(),
                }}
            >
                <CohortsHub />
            </ProfileContext.Provider>
        </AddressContext.Provider>,
    );
}

describe("CohortsHub", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockReset();
        mockToast.mockReset();
    });

    it("renders breadcrumbs, permissions and the cohorts table", async () => {
        mockExec.mockResolvedValueOnce({
            cohorts: [
                {
                    cohortId: "cohort-1",
                    name: "Spring 2026",
                    courseId: "course-1",
                    members: ["user-1", "user-2"],
                    schedule: { startAt: 1767225600000, endAt: null },
                    createdAt: "1767225600000",
                },
            ],
            courses: [{ courseId: "course-1", title: "Course One" }],
        });

        renderPage();

        expect(
            screen.getByRole("heading", { name: COHORTS_PAGE_HEADING }),
        ).toBeInTheDocument();
        expect(screen.getByTestId("breadcrumbs-json")).toHaveTextContent(
            JSON.stringify([{ label: COHORTS_PAGE_HEADING, href: "#" }]),
        );
        expect(screen.getByTestId("permissions-json")).toHaveTextContent(
            JSON.stringify([UIConstants.permissions.manageUsers]),
        );

        await waitFor(() => {
            expect(screen.getByText("Spring 2026")).toBeInTheDocument();
        });

        expect(screen.getByText("Course One")).toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.getByText("Spring 2026").closest("a")).toHaveAttribute(
            "href",
            "/dashboard/cohorts/cohort-1",
        );
    });

    it("renders the empty state when there are no cohorts", async () => {
        mockExec.mockResolvedValueOnce({
            cohorts: [],
            courses: [],
        });

        renderPage();

        await waitFor(() => {
            expect(
                screen.getByText(COHORTS_LIST_EMPTY_TITLE),
            ).toBeInTheDocument();
        });
    });
});
