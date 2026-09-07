import test from "node:test";
import assert from "node:assert/strict";
import { postJson, siteClient, modelClient } from "./transport.mjs";
import {
    config,
    context,
    lease,
    proposal,
    receipt,
    workflow,
    temporary,
    httpFixture,
    json,
} from "./test-fixtures.mjs";
import { privateJournal } from "./journal.mjs";
import { runOnce } from "./run-once.mjs";

const modelResponse = (content = JSON.stringify(proposal), extra = {}) => ({
    choices: [
        {
            finish_reason: "stop",
            message: { role: "assistant", content },
            ...extra,
        },
    ],
});

test("actual HTTP workflow confines credentials/endpoints and sends no tool or approval authority", async (t) => {
    const native = workflow();
    const siteServer = await httpFixture(t, async (request, res) => {
        assert.match(
            request.url,
            /^\/api\/feedback-review\/(claim|context|result)$/,
        );
        json(
            res,
            await native.site(request.url.split("/").at(-1), request.body),
        );
    });
    const provider = await httpFixture(t, (request, res) =>
        json(res, modelResponse()),
    );
    const settings = {
        ...config,
        site: siteServer.url,
        modelUrl: provider.url + "/v1/chat/completions",
        modelKey: "provider-fixture-key",
        model: "operator-selected",
        maxTokens: 512,
    };
    const dir = await temporary(t),
        journal = await privateJournal(dir);
    try {
        const result = await runOnce({
            config: settings,
            journal,
            site: siteClient(settings),
            model: modelClient(settings),
        });
        assert.equal(result.kind, "confirmed");
        assert.equal(provider.requests.length, 1);
        assert.deepEqual(
            siteServer.requests.map((r) => r.url),
            [
                "/api/feedback-review/claim",
                "/api/feedback-review/context",
                "/api/feedback-review/result",
            ],
        );
        assert(
            siteServer.requests.every(
                (r) => r.headers.authorization === "Bearer fixture-grant",
            ),
        );
        const request = provider.requests[0];
        assert.equal(
            request.headers.authorization,
            "Bearer provider-fixture-key",
        );
        assert.equal(request.url, "/v1/chat/completions");
        assert.equal(request.body.n, 1);
        assert.equal(request.body.store, false);
        assert.equal(request.body.max_completion_tokens, 512);
        assert.equal(request.body.tools, undefined);
        assert.equal(request.body.stream, false);
        assert.deepEqual(JSON.parse(request.body.messages[1].content), {
            comment: context.feedback.text,
            currentText: context.context.value,
        });
        const payload = JSON.stringify(request.body);
        for (const privateValue of [
            settings.grant,
            settings.modelKey,
            lease.feedbackId,
            lease.leaseId,
            lease.inputHash,
        ])
            assert(!payload.includes(privateValue));
        await assert.rejects(async () => siteClient(settings)("approve", {}), {
            code: "operation-refused",
        });
        assert.equal(siteServer.requests.length, 3);
    } finally {
        await journal.close();
    }
});

test("redirects cannot forward either credential to another endpoint", async (t) => {
    const sink = await httpFixture(t, (_r, res) => json(res, {}));
    const redirect = await httpFixture(t, (_r, res) => {
        res.writeHead(307, { location: sink.url });
        res.end();
    });
    await assert.rejects(postJson(redirect.url, "private", {}), {
        code: "network-unconfirmed",
    });
    assert.equal(sink.requests.length, 0);
});

test("HTTP errors, wrong content type, broken JSON and oversized replies reveal no server body", async (t) => {
    const cases = [
        {
            code: "http-401",
            reply: (res) => {
                res.writeHead(401);
                res.end("sensitive-body");
            },
        },
        {
            code: "invalid-response",
            reply: (res) => {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end("sensitive-body");
            },
        },
        {
            code: "invalid-response",
            reply: (res) => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end("{broken sensitive-body");
            },
        },
        {
            code: "response-too-large",
            reply: (res) => json(res, { large: "x".repeat(65536) }),
        },
    ];
    for (const sample of cases) {
        const server = await httpFixture(t, (_r, res) => sample.reply(res));
        await assert.rejects(
            postJson(server.url, "key", {}),
            (error) =>
                error.code === sample.code &&
                !String(error).includes("sensitive-body"),
        );
    }
});

test("timeouts are bounded and oversized outgoing UTF8 is refused before any request", async (t) => {
    const server = await httpFixture(t, () => {});
    const started = Date.now();
    await assert.rejects(postJson(server.url, "key", {}, { timeout: 30 }), {
        code: "network-unconfirmed",
    });
    assert(Date.now() - started < 2000);
    const count = server.requests.length;
    await assert.rejects(
        postJson(server.url, "key", { text: "界".repeat(30000) }),
        { code: "request-too-large" },
    );
    assert.equal(server.requests.length, count);
});

test("model truncation, refusal, tool calls, multiple choices and malformed content are refused", async (t) => {
    const invalid = [
        modelResponse("{}", { finish_reason: "length" }),
        modelResponse("{}", { message: { content: "{}", refusal: "no" } }),
        modelResponse("{}", { message: { content: "{}", tool_calls: [] } }),
        modelResponse("{}", { message: { content: "{}", function_call: {} } }),
        { choices: [...modelResponse().choices, ...modelResponse().choices] },
        modelResponse("not JSON"),
        { choices: { 0: modelResponse().choices[0], length: 1 } },
        modelResponse("{}", { message: { role: "user", content: "{}" } }),
    ];
    for (const value of invalid) {
        const server = await httpFixture(t, (_r, res) => json(res, value));
        await assert.rejects(
            modelClient({
                modelUrl: server.url,
                modelKey: "key",
                model: "fixture",
                maxTokens: 32,
            })({ comment: "data", currentText: "text" }),
        );
    }
});
