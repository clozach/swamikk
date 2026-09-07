import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import PermissionsEditor from "../users/permissions-editor";
import MiscellaneousTab from "../settings/tabs/miscellaneous";
import SeoEditor from "../page-editor/seo-editor";
import Settings from "../settings";
import { QuestionBuilder } from "../products/quiz-builder/question-builder";
import { SiteInfoContext, FeaturesContext } from "@components/contexts";
import { SITE_SETTINGS_SECTION_GENERAL } from "@ui-config/strings";

const mockExec = jest.fn();
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("next/dynamic", () => () => () => null);
jest.mock("@courselit/utils", () => ({
    ...jest.requireActual("@courselit/utils"),
    FetchBuilder: jest.fn().mockImplementation(() => ({
        setUrl: jest.fn().mockReturnThis(),
        setPayload: jest.fn().mockReturnThis(),
        setIsGraphQLEndpoint: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnThis(),
        exec: mockExec,
    })),
}));
jest.mock("@courselit/components-library", () => {
    const Wrap = ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    );
    return {
        Checkbox: jest.requireActual(
            "../../../../../packages/components-library/src/checkbox",
        ).default,
        Form: ({ children }: { children?: React.ReactNode }) => (
            <form>{children}</form>
        ),
        FormField: () => null,
        FormSubmit: () => null,
        MediaSelector: () => null,
        Select: () => null,
        Tabbs: jest.requireActual(
            "../../../../../packages/components-library/src/tabs",
        ).default,
        Dialog2: () => null,
        Table: Wrap,
        TableHead: Wrap,
        TableBody: Wrap,
        TableRow: Wrap,
        PageBuilderPropertyHeader: ({ label }: { label: string }) => (
            <p>{label}</p>
        ),
        Tooltip: Wrap,
        Chip: Wrap,
        IconButton: ({ children }: { children?: React.ReactNode }) => (
            <button>{children}</button>
        ),
        useToast: () => ({ toast: jest.fn() }),
    };
});

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});
beforeEach(() =>
    mockExec.mockResolvedValue({
        settings: { hideCourseLitBranding: false },
        apikeys: [],
    }),
);

async function expectNamedCheckboxes() {
    await waitFor(() =>
        expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0),
    );
    for (const checkbox of screen.getAllByRole("checkbox")) {
        expect(checkbox).toHaveAccessibleName();
    }
}

test("permission controls retain their visible permission names", async () => {
    render(
        <PermissionsEditor
            user={{ id: "u", userId: "u", permissions: [] } as any}
            address={{ backend: "http://example.test", frontend: "" }}
        />,
    );
    await expectNamedCheckboxes();
});

test("login provider controls have individual accessible names", async () => {
    render(
        <SiteInfoContext.Provider value={{ logins: ["email"] } as any}>
            <FeaturesContext.Provider value={[]}>
                <MiscellaneousTab />
            </FeaturesContext.Provider>
        </SiteInfoContext.Provider>,
    );
    await expectNamedCheckboxes();
});

test("search indexing has a named checkbox", async () => {
    render(
        <SeoEditor
            title="A page"
            description="Description"
            socialImage={null}
            robotsAllowed
            profile={{} as any}
            address={{ backend: "http://example.test", frontend: "" }}
            onClose={jest.fn()}
            onSave={jest.fn()}
        />,
    );
    await expectNamedCheckboxes();
});

test("branding has a named checkbox", async () => {
    render(
        <Settings
            siteinfo={{} as any}
            profile={{} as any}
            selectedTab={SITE_SETTINGS_SECTION_GENERAL}
        />,
    );
    await expectNamedCheckboxes();
});

test("quiz answer checkboxes identify each answer", async () => {
    render(
        <QuestionBuilder
            index={0}
            details={
                {
                    text: "Pick one",
                    options: [
                        { text: "Breathe", correctAnswer: true },
                        { text: "Rest", correctAnswer: false },
                    ],
                } as any
            }
            setOptionText={jest.fn()}
            setQuestionText={jest.fn()}
            removeOption={jest.fn()}
            addNewOption={jest.fn()}
            setCorrectOption={jest.fn()}
            deleteQuestion={jest.fn()}
        />,
    );
    await expectNamedCheckboxes();
    expect(screen.getByRole("checkbox", { name: /Breathe/ })).not.toBe(
        screen.getByRole("checkbox", { name: /Rest/ }),
    );
});
