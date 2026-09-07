import React from "react";
import RootLayout from "../layout";

const { renderToStaticMarkup } = jest.requireActual(
    "react-dom/server.node",
) as typeof import("react-dom/server");

jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("@/app/actions", () => ({
    getAddressFromHeaders: jest.fn(async () => "http://example.test"),
}));
jest.mock("@ui-lib/utils", () => ({
    getFullSiteSetup: jest.fn(async () => null),
}));
jest.mock("@/lib/theme-styles", () => ({
    generateThemeStyles: jest.fn(() => ""),
}));
jest.mock(
    "@/lib/fonts",
    () =>
        new Proxy({}, { get: () => ({ variable: "font", className: "font" }) }),
);

test("the rendered document declares the interface language even without site setup", async () => {
    const html = renderToStaticMarkup(
        await RootLayout({ children: <main>Account</main> }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(document.querySelector("main")?.textContent).toBe("Account");
});
