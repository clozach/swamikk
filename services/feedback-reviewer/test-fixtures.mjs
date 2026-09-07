import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const lease = {
    feedbackId: "feedback-fixture",
    generation: 1,
    leaseId: "lease-fixture",
    inputHash: "a".repeat(64),
};
export const context = {
    ...lease,
    feedback: { text: "Fix the spelling.", trust: "untrusted-user-input" },
    context: { kind: "text", valueKind: "text", value: "Welcom" },
};
export const proposal = {
    kind: "text-proposal",
    summary: "Correct spelling.",
    text: "Welcome",
};
export const receipt = {
    feedbackId: lease.feedbackId,
    generation: lease.generation,
    state: "done",
    outcome: "text-proposal",
    proposalId: "proposal-fixture",
};
export const config = { site: "https://site.example", grant: "fixture-grant" };
export function workflow(overrides = {}) {
    const calls = [];
    return {
        calls,
        site: async (operation, request) => {
            calls.push({ operation, request });
            if (overrides[operation]) return overrides[operation](request);
            if (operation === "claim")
                return {
                    claim: {
                        ...lease,
                        leaseUntil: new Date(Date.now() + 300000).toISOString(),
                    },
                };
            if (operation === "context") return structuredClone(context);
            return {
                ...receipt,
                outcome: request.result.kind,
                ...(request.result.kind === "escalation"
                    ? { proposalId: undefined }
                    : {}),
            };
        },
    };
}
export async function temporary(t, cleanup = true) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kk-reviewer-test-"));
    await fs.chmod(dir, 0o700);
    if (cleanup) t.after(() => fs.rm(dir, { recursive: true, force: true }));
    return dir;
}
export async function httpFixture(t, respond) {
    const requests = [];
    const server = createServer(async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const record = {
            url: req.url,
            headers: req.headers,
            body: raw ? JSON.parse(raw) : null,
        };
        requests.push(record);
        await respond(record, res);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(
        () =>
            new Promise((resolve) => {
                server.close(resolve);
                server.closeAllConnections();
            }),
    );
    return { requests, url: `http://127.0.0.1:${server.address().port}` };
}
export function json(res, value, status = 200) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
}
