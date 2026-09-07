import React from "react";
import { render, screen } from "@testing-library/react";
import PropertyHeader from "../../../../../packages/components-library/src/page-builder-property-header";
import type { Address, Profile } from "@courselit/common-models";

const MediaSelector: typeof import("@courselit/components-library").MediaSelector =
    jest.requireActual(
        "../../../../../packages/components-library/src/media-selector",
    ).default;

jest.mock("../../../../../packages/components-library/src", () => ({
    PageBuilderPropertyHeader: jest.requireActual(
        "../../../../../packages/components-library/src/page-builder-property-header",
    ).default,
    Tooltip: jest.requireActual(
        "../../../../../packages/components-library/src/tooltip",
    ).default,
    Button2: ({ children }: { children: React.ReactNode }) => (
        <button>{children}</button>
    ),
    useToast: () => ({ toast: jest.fn() }),
}));
jest.mock(
    "../../../../../packages/components-library/src/media-selector/file-upload-dialog",
    () => ({
        FileUploadAlertDialog: () => <button>Upload file</button>,
    }),
);

test.each(["", "   ", "\n\t"])(
    "an intentionally blank property label %j does not create a heading",
    (label) => {
        render(<PropertyHeader label={label} />);
        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    },
);

test("a supplied heading and tooltip are preserved", () => {
    const { container } = render(
        <PropertyHeader
            label="Image description"
            tooltip="Describe what is visible"
        />,
    );
    expect(
        screen.getByRole("heading", { level: 2, name: "Image description" }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-state="closed"]')).not.toBeNull();
});

test("a tooltip remains available without a manufactured empty heading", () => {
    const { container } = render(
        <PropertyHeader label=" " tooltip="Image help" />,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector('[data-state="closed"]')).not.toBeNull();
});

test.each([true, false])(
    "actual MediaSelector allows an untitled field (hidePreview=%s)",
    (hidePreview) => {
        const { container } = render(
            <MediaSelector
                title=""
                profile={{ userId: "member" } as Profile}
                address={
                    {
                        frontend: "http://local",
                        backend: "http://local",
                    } as Address
                }
                onSelection={() => {}}
                src=""
                srcTitle=""
                hidePreview={hidePreview}
                strings={{}}
                type="user"
            />,
        );
        expect(container.querySelector("h2")).toBeNull();
        expect(
            screen.getByRole("button", { name: /upload/i }),
        ).toBeInTheDocument();
    },
);
