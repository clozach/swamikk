import { act, renderHook, waitFor } from "@testing-library/react";
import { useMediaLit } from "@courselit/components-library/images";

type UploadOptions = { onSuccess?: (payload: unknown) => void };

const mockUploads: Array<{
    options: UploadOptions;
    start: jest.Mock;
    abort: jest.Mock;
}> = [];
jest.mock("tus-js-client", () => ({
    Upload: class {
        start = jest.fn();
        abort = jest.fn().mockResolvedValue(undefined);
        constructor(
            _: File,
            public options: UploadOptions,
        ) {
            mockUploads.push(this);
        }
    },
}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
const file = () => new File(["image"], "picture.png", { type: "image/png" });
const media = {
    mediaId: "new-image",
    file: "https://media.test/image.png",
    group: "private-internal-id",
};
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const signature = () =>
    response({
        signature: "signed-for-viewer",
        endpoint: "https://uploads.test",
    });
let fetchMock: jest.Mock;
const originalFetch = global.fetch;
beforeEach(() => {
    mockUploads.length = 0;
    fetchMock = jest
        .fn()
        .mockResolvedValueOnce(signature())
        .mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
});
afterEach(() => {
    global.fetch = originalFetch;
});

function mount(onUploadComplete = jest.fn(), onUploadError = jest.fn()) {
    return {
        ...renderHook(() =>
            useMediaLit({
                signatureEndpoint: "/api/media/presigned",
                access: "public",
                onUploadComplete,
                onUploadError,
            }),
        ),
        onUploadComplete,
        onUploadError,
    };
}
async function begin(result: ReturnType<typeof mount>["result"]) {
    let outcome!: Promise<unknown>;
    act(() => {
        outcome = result.current.uploadFile(file()).catch((error) => error);
    });
    await waitFor(() => expect(mockUploads).toHaveLength(1));
    return { outcome };
}
function success(header: string | null = JSON.stringify(media)) {
    mockUploads[0].options.onSuccess!({
        lastResponse: { getHeader: () => header },
    } as never);
}

it.each([
    ["HTTP refusal", response({}, false)],
    ["missing signature", response({ endpoint: "https://uploads.test" })],
    ["missing endpoint", response({ signature: "signed" })],
])(
    "rejects %s without starting an upload and permits retry",
    async (_, reply) => {
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(reply)
            .mockResolvedValueOnce(signature());
        const { result, onUploadComplete } = mount();
        let error: unknown;
        await act(async () => {
            error = await result.current
                .uploadFile(file())
                .catch((value) => value);
        });
        expect(error).toBeInstanceOf(Error);
        expect(result.current.isUploading).toBe(false);
        expect(mockUploads).toHaveLength(0);
        expect(onUploadComplete).not.toHaveBeenCalled();
        const { outcome } = await begin(result);
        act(() => result.current.cancelUpload());
        expect(await outcome).toMatchObject({ name: "AbortError" });
    },
);

it.each([null, "not json", "{}"])(
    "rejects invalid completion header %s without declaring success",
    async (header) => {
        const { result, onUploadComplete } = mount();
        const { outcome } = await begin(result);
        await act(async () => success(header));
        expect(await outcome).toBeInstanceOf(Error);
        expect(onUploadComplete).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.current.isUploading).toBe(false);
    },
);

it("waits for cleanup registration and the caller's durable save before completing", async () => {
    const tracked = deferred<{ ok: boolean }>();
    const saved = deferred<void>();
    fetchMock
        .mockReset()
        .mockResolvedValueOnce(signature())
        .mockReturnValueOnce(tracked.promise);
    const { result, onUploadComplete } = mount(jest.fn(() => saved.promise));
    const { outcome } = await begin(result);
    let finished = false;
    void outcome.then(() => {
        finished = true;
    });
    await act(async () => success());
    expect(result.current.isUploading).toBe(true);
    expect(finished).toBe(false);
    expect(onUploadComplete).not.toHaveBeenCalled();
    await act(async () => tracked.resolve({ ok: true }));
    expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/media/uploads",
        expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ mediaId: "new-image" }),
        }),
    );
    expect(onUploadComplete).toHaveBeenCalledWith({
        mediaId: "new-image",
        file: media.file,
    });
    expect(result.current.isUploading).toBe(true);
    expect(finished).toBe(false);
    await act(async () => saved.resolve());
    expect(await outcome).toEqual({ mediaId: "new-image", file: media.file });
    expect(result.current.isUploading).toBe(false);
    expect(result.current.uploadProgress).toBe(100);
    expect(mockUploads[0].options).toMatchObject({
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
        metadata: { access: "public" },
        headers: { "x-medialit-signature": "signed-for-viewer" },
    });
});

it("rejects a tracking failure without attaching the uploaded image", async () => {
    fetchMock
        .mockReset()
        .mockResolvedValueOnce(signature())
        .mockResolvedValueOnce({ ok: false });
    const { result, onUploadComplete } = mount();
    const { outcome } = await begin(result);
    await act(async () => success());
    expect(await outcome).toMatchObject({
        message: expect.stringContaining("could not be registered"),
    });
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(result.current.isUploading).toBe(false);
});

it("cancels a pending signature even if a late response ignores AbortSignal", async () => {
    const signed = deferred<ReturnType<typeof signature>>();
    fetchMock.mockReset().mockReturnValueOnce(signed.promise);
    const { result } = mount();
    let outcome!: Promise<unknown>;
    act(() => {
        outcome = result.current.uploadFile(file()).catch((error) => error);
    });
    act(() => result.current.cancelUpload());
    expect(await outcome).toMatchObject({ name: "AbortError" });
    await act(async () => signed.resolve(signature()));
    expect(mockUploads).toHaveLength(0);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});

it("finishes cleanup registration after cancellation but never invokes attachment", async () => {
    const tracked = deferred<{ ok: boolean }>();
    fetchMock
        .mockReset()
        .mockResolvedValueOnce(signature())
        .mockReturnValueOnce(tracked.promise);
    const { result, onUploadComplete } = mount();
    const { outcome } = await begin(result);
    await act(async () => success());
    act(() => result.current.cancelUpload());
    expect(await outcome).toMatchObject({ name: "AbortError" });
    expect(mockUploads[0].abort).toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][1].signal).toBeUndefined();
    await act(async () => tracked.resolve({ ok: true }));
    expect(onUploadComplete).not.toHaveBeenCalled();
});

it("refuses a delayed preprocessing continuation after its component unmounts", async () => {
    const { result, unmount, onUploadComplete } = mount();
    const uploadAfterDownsize = result.current.uploadFile;
    unmount();
    let finished = false;
    let outcome: unknown;
    await act(async () => {
        void uploadAfterDownsize(file())
            .catch((error) => error)
            .then((value) => {
                finished = true;
                outcome = value;
            });
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockUploads).toHaveLength(0);
    expect(finished).toBe(true);
    expect(outcome).toMatchObject({ name: "AbortError" });
    expect(onUploadComplete).not.toHaveBeenCalled();
});
