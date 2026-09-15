/** @jest-environment node */
import { NextRequest } from "next/server";
import { UIConstants } from "@courselit/common-models";
import { POST } from "../uploads/route";
import { requestContext } from "@/services/content-changes/http";
import { deleteMedia, getMedia } from "@/services/medialit";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));
jest.mock("@/services/content-changes/http", () => ({
    ...jest.requireActual("@/services/content-changes/http"),
    requestContext: jest.fn(),
}));

const context = {
    subdomain: { _id: "domain-id", name: "school" },
    user: { permissions: [UIConstants.permissions.manageMedia] },
};
function request(
    body: unknown = { mediaId: "image-1" },
    origin = "https://school.example",
) {
    return new NextRequest("https://school.example/api/media/uploads", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("completed upload cleanup tracking", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(requestContext).mockResolvedValue(context as never);
        jest.mocked(getMedia).mockResolvedValue({
            mediaId: "image-1",
            group: "school",
        } as never);
        jest.mocked(deleteMedia).mockResolvedValue(true);
    });
    it("tracks an owned upload without returning provider URLs or sealing it", async () => {
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            mediaId: "image-1",
            tracked: true,
        });
        expect(deleteMedia).toHaveBeenCalledWith("image-1", "domain-id");
    });
    it.each([
        { mediaId: "image-1", group: "another-site" },
        { mediaId: "different-id", group: "school" },
    ])("refuses unowned or substituted provider objects", async (media) => {
        jest.mocked(getMedia).mockResolvedValue(media as never);
        expect((await POST(request())).status).toBe(400);
        expect(deleteMedia).not.toHaveBeenCalled();
    });
    it("requires an active signed-in user with upload permission", async () => {
        jest.mocked(requestContext).mockResolvedValue({
            ...context,
            user: undefined,
        } as never);
        expect((await POST(request())).status).toBe(401);
        jest.mocked(requestContext).mockResolvedValue({
            ...context,
            user: { permissions: [] },
        } as never);
        expect((await POST(request())).status).toBe(403);
        expect(getMedia).not.toHaveBeenCalled();
    });
    it("refuses cross-origin requests and malformed identifiers before provider access", async () => {
        expect(
            (await POST(request(undefined, "https://other.example"))).status,
        ).toBe(403);
        expect((await POST(request({ mediaId: "../bad" }))).status).toBe(400);
        expect(
            (await POST(request({ mediaId: "image-1", file: "spoofed" })))
                .status,
        ).toBe(400);
        expect(getMedia).not.toHaveBeenCalled();
    });
    it("does not claim success when durable tracking fails", async () => {
        jest.mocked(deleteMedia).mockRejectedValue(
            new Error("private database error"),
        );
        const response = await POST(request());
        expect(response.status).toBe(503);
        expect(JSON.stringify(await response.json())).not.toContain(
            "private database error",
        );
    });
});
