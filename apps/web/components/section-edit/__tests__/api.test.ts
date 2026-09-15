import { submitSectionEdit } from "../api";
import { removal } from "./fixtures";
const input = {
    action: "reverse" as const,
    requestId: "stable-id",
    editId: removal.editId,
};
beforeEach(() => {
    global.fetch = jest.fn();
});

test("a lost response retries with the same request identity", async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error("network"));
    (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ kind: "applied", edit: removal }),
    });
    expect(await submitSectionEdit(input)).toEqual({
        kind: "applied",
        edit: removal,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const calls = (fetch as jest.Mock).mock.calls;
    expect(calls[0][1].body).toBe(calls[1][1].body);
    expect(calls[1][1].credentials).toBe("same-origin");
});

test("two lost responses report uncertainty, not a claim that removal failed", async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error("network"));
    expect((await submitSectionEdit(input)).kind).toBe("uncertain");
});

test("conflicts keep the server's explanation", async () => {
    (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: { message: "Draft changed elsewhere" } }),
    });
    expect(await submitSectionEdit(input)).toEqual({
        kind: "stale",
        message: "Draft changed elsewhere",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
});

test("a server failure after an uncertain write retries its receipt and stays uncertain", async () => {
    (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Recovery pending" } }),
    });
    expect((await submitSectionEdit(input)).kind).toBe("uncertain");
    expect(fetch).toHaveBeenCalledTimes(2);
});
