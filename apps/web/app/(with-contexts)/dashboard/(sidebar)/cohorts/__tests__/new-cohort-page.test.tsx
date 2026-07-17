import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewCohortPage from "../new/page";
import { AddressContext, ProfileContext } from "@components/contexts";
import { UIConstants } from "@courselit/common-models";
import { responses } from "@/config/strings";
import {
    BTN_CONTINUE,
    COHORT_COURSE_LABEL,
    COHORT_NAME_LABEL,
    TOAST_TITLE_ERROR,
} from "@ui-config/strings";

const mockToast = jest.fn();
const mockPush = jest.fn();
const mockExec = jest.fn();
const mockSetPayload = jest.fn();

jest.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

jest.mock("@courselit/components-library", () => ({
    useToast: () => ({
        toast: mockToast,
    }),
    Form: ({
        children,
        onSubmit,
    }: {
        children: React.ReactNode;
        onSubmit: (e: React.FormEvent) => void;
    }) => <form onSubmit={onSubmit}>{children}</form>,
    FormField: ({ label, ...props }: { label: string; [x: string]: any }) => (
        <input aria-label={label} {...props} />
    ),
    Select: ({
        options,
        value,
        onChange,
        title,
        placeholderMessage,
    }: {
        options: { label: string; value: string }[];
        value: string;
        onChange: (value: string) => void;
        title?: string;
        placeholderMessage?: string;
    }) => (
        <select
            aria-label={title || placeholderMessage}
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            <option value="" />
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
    Button: ({
        children,
        component,
        href,
        ...props
    }: {
        children: React.ReactNode;
        component?: string;
        href?: string;
        [x: string]: any;
    }) =>
        component === "link" ? (
            <a href={href}>{children}</a>
        ) : (
            <button {...props}>{children}</button>
        ),
}));

jest.mock("@courselit/utils", () => {
    const actual = jest.requireActual("@courselit/utils");
    return {
        ...actual,
        FetchBuilder: jest.fn().mockImplementation(() => ({
            setUrl: jest.fn().mockReturnThis(),
            setPayload: mockSetPayload.mockReturnThis(),
            setIsGraphQLEndpoint: jest.fn().mockReturnThis(),
            build: jest.fn().mockReturnThis(),
            exec: mockExec,
        })),
    };
});

jest.mock("@components/admin/dashboard-content", () => ({
    __esModule: true,
    default: ({
        children,
        breadcrumbs,
    }: {
        children: React.ReactNode;
        breadcrumbs?: { label: string; href: string }[];
    }) => (
        <div>
            <div data-testid="breadcrumbs-json">
                {JSON.stringify(breadcrumbs || [])}
            </div>
            {children}
        </div>
    ),
}));

jest.mock("@components/admin/loading-screen", () => ({
    __esModule: true,
    default: () => <div data-testid="loading-screen" />,
}));

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
                <NewCohortPage />
            </ProfileContext.Provider>
        </AddressContext.Provider>,
    );
}

describe("NewCohortPage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockReset();
        mockPush.mockReset();
        mockToast.mockReset();
        mockSetPayload.mockReset();
        mockSetPayload.mockReturnThis();
    });

    it("creates a cohort and navigates to its detail page", async () => {
        mockExec
            .mockResolvedValueOnce({
                courses: [{ courseId: "course-1", title: "Course One" }],
            })
            .mockResolvedValueOnce({
                cohort: { cohortId: "cohort-1" },
            });

        renderPage();

        const submitButton = screen.getByRole("button", {
            name: BTN_CONTINUE,
        });
        expect(submitButton).toBeDisabled();

        await waitFor(() => {
            expect(screen.getByText("Course One")).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText(COHORT_NAME_LABEL), {
            target: { value: "Spring 2026" },
        });
        fireEvent.change(screen.getByLabelText(COHORT_COURSE_LABEL), {
            target: { value: "course-1" },
        });

        expect(submitButton).not.toBeDisabled();
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith(
                "/dashboard/cohorts/cohort-1",
            );
        });

        expect(mockSetPayload).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({
                    name: "Spring 2026",
                    courseId: "course-1",
                }),
            }),
        );
    });

    it("surfaces the duplicate cohort name error", async () => {
        mockExec
            .mockResolvedValueOnce({
                courses: [{ courseId: "course-1", title: "Course One" }],
            })
            .mockRejectedValueOnce(new Error(responses.cohort_exists));

        renderPage();

        await waitFor(() => {
            expect(screen.getByText("Course One")).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText(COHORT_NAME_LABEL), {
            target: { value: "Spring 2026" },
        });
        fireEvent.change(screen.getByLabelText(COHORT_COURSE_LABEL), {
            target: { value: "course-1" },
        });
        fireEvent.click(screen.getByRole("button", { name: BTN_CONTINUE }));

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith({
                title: TOAST_TITLE_ERROR,
                description: responses.cohort_exists,
                variant: "destructive",
            });
        });
        expect(mockPush).not.toHaveBeenCalled();
    });
});
