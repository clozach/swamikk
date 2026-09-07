import { getUserProfile } from "../helpers";
import { defaultState } from "@components/default-state";

const mockExec = jest.fn();
jest.mock("@courselit/utils", () => ({
    FetchBuilder: jest.fn().mockImplementation(() => ({
        setUrl: jest.fn().mockReturnThis(),
        setPayload: jest.fn().mockReturnThis(),
        setIsGraphQLEndpoint: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnThis(),
        exec: mockExec,
    })),
}));

beforeEach(() => mockExec.mockReset());

it.each([null, undefined])(
    "returns a fetched guest for an absent native identity (%s), safe for unconditional profile consumers",
    async (profile) => {
        mockExec.mockResolvedValueOnce({ profile });
        const result = await getUserProfile("https://school.example");
        // The outer layout reads fetched; course-old reads purchases directly.
        expect(result.fetched).toBe(true);
        expect(result.purchases?.find(() => true)).toBeUndefined();
        expect(result).toEqual({ ...defaultState.profile, fetched: true });
    },
);

it("preserves an existing member identity and marks its read complete", async () => {
    const profile = {
        userId: "member",
        permissions: [],
        purchases: [{ courseId: "practice" }],
    };
    mockExec.mockResolvedValueOnce({ profile });
    expect(await getUserProfile("https://school.example")).toEqual({
        ...profile,
        fetched: true,
    });
});

it("does not misclassify a failed request as a confirmed guest", async () => {
    mockExec.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(getUserProfile("https://school.example")).rejects.toThrow(
        "network unavailable",
    );
});
