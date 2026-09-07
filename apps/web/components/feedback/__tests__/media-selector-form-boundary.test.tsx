import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FieldDraft from "../page-field-draft";
import { feedbackRequest } from "../api";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("../api", () => ({ feedbackRequest: jest.fn() }));
jest.mock("@/lib/utils", () =>
    jest.requireActual(
        "../../../../../packages/components-library/src/lib/utils",
    ),
);
jest.mock("../../../../../packages/components-library/src", () => ({
    get MediaSelector() {
        return jest.requireActual(
            "../../../../../packages/components-library/src/media-selector",
        ).default;
    },
    Button2: jest.requireActual(
        "../../../../../packages/components-library/src/components/ui/button",
    ).Button,
    PageBuilderPropertyHeader: jest.requireActual(
        "../../../../../packages/components-library/src/page-builder-property-header",
    ).default,
    Tooltip: ({ children }) => children,
    useToast: () => ({ toast: jest.fn() }),
}));
jest.mock(
    "../../../../../packages/components-library/src/media-selector/file-upload-dialog",
    () => ({ FileUploadAlertDialog: () => null }),
);
jest.mock("@courselit/utils", () => ({
    FetchBuilder: class {
        setUrl() {
            return this;
        }
        setHttpMethod() {
            return this;
        }
        setIsGraphQLEndpoint() {
            return this;
        }
        build() {
            return { exec: async () => ({ message: "success" }) };
        }
    },
}));

test("removing media through the real shared control does not prepare an unrelated page change", async () => {
    const user = userEvent.setup();
    const target = { pageId: "home", widgetId: "hero" };
    sessionStorage.clear();
    sessionStorage.setItem(
        "page-edit:admin:home:hero:photo",
        JSON.stringify({
            patch: { kind: "image", mediaId: "public-photo", alt: "A garden" },
            summary: "Keep this draft until reviewed",
        }),
    );
    jest.mocked(feedbackRequest).mockResolvedValue({
        change: { id: "unexpected-proposal" },
    });
    render(
        <FieldDraft
            target={target}
            field={
                {
                    field: "photo",
                    kind: "image",
                    label: "Photo",
                    value: { mediaId: "public-photo", alt: "A garden" },
                    defaultDerived: false,
                } as any
            }
            profile={{ userId: "admin" } as any}
            address={{ backend: "http://local" } as any}
        />,
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
        expect(
            screen.getByRole("button", { name: "Remove" }),
        ).not.toBeDisabled(),
    );
    expect(feedbackRequest).not.toHaveBeenCalled();
    expect(
        screen.getByLabelText("What should this change accomplish?"),
    ).toHaveValue("Keep this draft until reviewed");
});
