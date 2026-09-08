import React from "react";
import Layout from "../layout";
import { getProduct } from "../helpers";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Constants } from "@courselit/common-models";
import { COURSE_VIEWER_CURRENT_URL_HEADER } from "@/lib/course-viewer-session-params";
import LeanDownloadLayout from "../lean-download-layout";
import LayoutWithSidebar from "../layout-with-sidebar";

jest.mock("../helpers", () => ({ getProduct: jest.fn() }));
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("next/navigation", () => ({
    redirect: jest.fn((href) => {
        throw new Error(`redirect:${href}`);
    }),
    notFound: jest.fn(() => {
        throw new Error("not-found");
    }),
}));
jest.mock("@/app/actions", () => ({
    getAddressFromHeaders: jest
        .fn()
        .mockResolvedValue("https://school.example"),
}));
jest.mock("@ui-lib/utils", () => ({ getFullSiteSetup: jest.fn() }));
jest.mock("../lean-download-layout", () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock("../layout-with-sidebar", () => ({
    __esModule: true,
    default: () => null,
}));

const params = { slug: "practice", id: "download-1" };
const renderLayout = () =>
    Layout({ params: Promise.resolve(params), children: <p>Content</p> });
const requestHeaders = (suffix = "/lesson-1") =>
    new Headers({
        cookie: "unrelated-cookie=value",
        [COURSE_VIEWER_CURRENT_URL_HEADER]: `https://school.example/course/practice/download-1${suffix}`,
    });
const product = {
    type: Constants.CourseType.DOWNLOAD,
    courseId: "download-1",
    pageId: "practice-offer",
    isPreview: false,
};

beforeEach(() => {
    jest.clearAllMocks();
    (headers as jest.Mock).mockResolvedValue(requestHeaders());
    (getProduct as jest.Mock).mockResolvedValue(product);
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
});

it.each(["/lesson-1", "", "/discussions"])(
    "sends an anonymous download prospect directly to its public offer from %s",
    async (suffix) => {
        const currentHeaders = requestHeaders(suffix);
        (headers as jest.Mock).mockResolvedValue(currentHeaders);
        await expect(renderLayout()).rejects.toThrow(
            "redirect:/p/practice-offer",
        );
        expect(redirect).toHaveBeenCalledTimes(1);
        expect(auth.api.getSession).toHaveBeenCalledWith({
            headers: currentHeaders,
        });
    },
);

it("uses checkout when a legacy download has no public page ID", async () => {
    (getProduct as jest.Mock).mockResolvedValue({
        ...product,
        pageId: undefined,
    });
    await expect(renderLayout()).rejects.toThrow(
        "redirect:/checkout?type=course&id=download-1",
    );
});

it("does not treat an unauthorised preview query as permission to enter the viewer", async () => {
    (headers as jest.Mock).mockResolvedValue(
        requestHeaders("/lesson-1?preview=true"),
    );
    await expect(renderLayout()).rejects.toThrow("redirect:/p/practice-offer");
});

it("preserves the signed-in download lesson redirect and safe viewer parameters", async () => {
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { id: "member" },
    });
    (headers as jest.Mock).mockResolvedValue(
        requestHeaders("/lesson-1?returnTo=%2Fdashboard%2Fusers"),
    );
    await expect(renderLayout()).rejects.toThrow(
        "redirect:/course/practice/download-1?returnTo=%2Fdashboard%2Fusers",
    );
});

it("keeps an authenticated ordinary or Mimic viewer on the lean download page", async () => {
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { id: "member-or-authorized-admin" },
    });
    (headers as jest.Mock).mockResolvedValue(requestHeaders(""));
    expect((await renderLayout()).type).toBe(LeanDownloadLayout);
    expect(redirect).not.toHaveBeenCalled();
});

it("preserves effective administrator preview and does not decide access from URL flags", async () => {
    (getProduct as jest.Mock).mockResolvedValue({
        ...product,
        isPreview: true,
    });
    (headers as jest.Mock).mockResolvedValue(requestHeaders("?preview=true"));
    expect((await renderLayout()).type).toBe(LeanDownloadLayout);
    expect(redirect).not.toHaveBeenCalled();
});

it("leaves ordinary course lessons on their existing access-controlled path", async () => {
    (getProduct as jest.Mock).mockResolvedValue({
        ...product,
        type: Constants.CourseType.COURSE,
    });
    expect((await renderLayout()).type).toBe(LayoutWithSidebar);
    expect(redirect).not.toHaveBeenCalled();
});

it("retains the not-found guard when the product cannot be read", async () => {
    (getProduct as jest.Mock).mockRejectedValue(new Error("not available"));
    await expect(renderLayout()).rejects.toThrow("not-found");
    expect(redirect).not.toHaveBeenCalled();
});
