/** @jest-environment node */
import { graphql, GraphQLObjectType, GraphQLSchema } from "graphql";
import { preparePreviewAudio, resolvePreviewAudio } from "../preview-audio";
import courseTypes from "../types";
import { getMedia, sealMedia } from "@/services/medialit";
import { collectMediaIdsFromValue } from "@courselit/common-logic";

jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
}));
jest.mock("@/services/queue");

const ctx = { subdomain: { _id: "school-id", name: "school" } } as any;
const media = {
    mediaId: "preview-1",
    group: "school",
    access: "public",
    mimeType: "audio/mpeg",
    file: "https://media.example/preview.mp3",
    originalFileName: "preview.mp3",
    size: 3000,
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getMedia).mockResolvedValue(media as any);
    jest.mocked(sealMedia).mockResolvedValue(media as any);
});

it("accepts only a provider-verified public audio ID and preserves media reference tracking", async () => {
    const selected = await preparePreviewAudio("preview-1", ctx);
    expect(sealMedia).toHaveBeenCalledWith("preview-1", "school-id");
    expect(
        collectMediaIdsFromValue({ previewAudio: selected }).has("preview-1"),
    ).toBe(true);
});

it.each([
    { group: "another-school" },
    { group: undefined },
    { access: "private" },
    { mimeType: "video/mp4" },
    { file: undefined },
    { file: "javascript:alert(1)" },
])(
    "rejects an unsafe or unavailable sample before sealing: %j",
    async (change) => {
        jest.mocked(getMedia).mockResolvedValue({ ...media, ...change } as any);
        await expect(preparePreviewAudio("preview-1", ctx)).rejects.toThrow();
        expect(sealMedia).not.toHaveBeenCalled();
    },
);

it("rejects a raw URL and supports removing a preview without fetching media", async () => {
    await expect(
        preparePreviewAudio("https://private.example/paid.mp3", ctx),
    ).rejects.toThrow();
    expect(await preparePreviewAudio(null, ctx)).toBeUndefined();
    expect(getMedia).not.toHaveBeenCalled();
});

it("rechecks access after sealing and revokes later private or cross-tenant reads", async () => {
    jest.mocked(sealMedia).mockResolvedValue({
        ...media,
        access: "private",
    } as any);
    await expect(preparePreviewAudio("preview-1", ctx)).rejects.toThrow();
    const course = { domain: "school-id", previewAudio: media } as any;
    jest.mocked(getMedia).mockResolvedValue({
        ...media,
        access: "private",
    } as any);
    expect(await resolvePreviewAudio(course, ctx)).toBeNull();
    jest.mocked(getMedia).mockClear();
    expect(
        await resolvePreviewAudio({ ...course, domain: "another" }, ctx),
    ).toBeNull();
    expect(getMedia).not.toHaveBeenCalled();
});

it("exposes the selected public sample through the actual GraphQL field and no raw media input", async () => {
    const schema = new GraphQLSchema({
        query: new GraphQLObjectType({
            name: "PreviewTest",
            fields: {
                product: {
                    type: courseTypes.courseType,
                    resolve: () => ({
                        domain: "school-id",
                        previewAudio: { mediaId: "preview-1" },
                    }),
                },
            },
        }),
    });
    const result = await graphql({
        schema,
        contextValue: ctx,
        source: "{ product { previewAudio { mediaId file mimeType access } } }",
    });
    expect(result.errors).toBeUndefined();
    expect(result.data?.product).toEqual({
        previewAudio: {
            mediaId: "preview-1",
            file: media.file,
            mimeType: "audio/mpeg",
            access: "public",
        },
    });
    expect(
        courseTypes.courseUpdateInput
            .getFields()
            .previewAudioMediaId.type.toString(),
    ).toBe("String");
    expect(
        courseTypes.courseUpdateInput.getFields().previewAudio,
    ).toBeUndefined();
});
