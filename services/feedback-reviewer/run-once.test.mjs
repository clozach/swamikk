import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { privateJournal } from "./journal.mjs";
import { runOnce } from "./run-once.mjs";
import {
    config,
    context,
    lease,
    proposal,
    receipt,
    workflow,
    temporary,
} from "./test-fixtures.mjs";

async function opened(t) {
    const dir = await temporary(t, false),
        journal = await privateJournal(dir);
    t.after(async () => {
        await journal.close();
        await fs.rm(dir, { recursive: true, force: true });
    });
    return { dir, journal };
}

test("one claim, one bounded model input, saved intent precedes acceptance, durable receipt", async (t) => {
    const { dir, journal } = await opened(t);
    let inputs = [];
    const { site, calls } = workflow({
        result: async (request) => {
            const saved = JSON.parse(
                await fs.readFile(path.join(dir, "pending.json")),
            );
            assert.deepEqual(saved.request, request);
            return receipt;
        },
    });
    const outcome = await runOnce({
        config,
        journal,
        site,
        model: async (input) => {
            inputs.push(input);
            return proposal;
        },
    });
    assert.equal(outcome.kind, "confirmed");
    assert.deepEqual(inputs, [
        { comment: context.feedback.text, currentText: context.context.value },
    ]);
    assert.deepEqual(
        calls.map((c) => c.operation),
        ["claim", "context", "result"],
    );
    assert.equal(await journal.read(), null);
    const files = await fs.readdir(dir);
    assert(files.includes(`confirmed-${lease.feedbackId}-1.json`));
    for (const file of files)
        assert.equal((await fs.stat(path.join(dir, file))).mode & 0o077, 0);
});

test("lost acceptance reply retries byte-identical result across restart without second inference", async (t) => {
    const dir = await temporary(t, false),
        first = await privateJournal(dir);
    let expected,
        modelCalls = 0;
    const a = workflow({
        result: async (request) => {
            expected = structuredClone(request);
            throw new Error("lost response");
        },
    });
    await assert.rejects(
        runOnce({
            config,
            journal: first,
            site: a.site,
            model: async () => {
                modelCalls++;
                return proposal;
            },
        }),
    );
    await first.close();
    const second = await privateJournal(dir);
    t.after(async () => {
        await second.close();
        await fs.rm(dir, { recursive: true, force: true });
    });
    const b = workflow({
        result: async (request) => {
            assert.deepEqual(request, expected);
            return receipt;
        },
    });
    const result = await runOnce({
        config,
        journal: second,
        site: b.site,
        model: async () => {
            modelCalls++;
            throw Error("must not run");
        },
    });
    assert.equal(result.kind, "confirmed");
    assert.equal(modelCalls, 1);
    assert.deepEqual(
        b.calls.map((c) => c.operation),
        ["result"],
    );
});

test("private, unsupported and rich text bypass inference and escalate without replacement", async (t) => {
    for (const target of [
        { kind: "escalation-only" },
        { kind: "text", valueKind: "rich-text", value: {} },
    ]) {
        const dir = await temporary(t),
            journal = await privateJournal(dir);
        const { site, calls } = workflow({
            context: () => ({ ...context, context: target }),
        });
        await runOnce({
            config,
            journal,
            site,
            model: () => {
                throw Error("must not run");
            },
        });
        assert.equal(calls.at(-1).request.result.kind, "escalation");
        assert.equal(calls.at(-1).request.result.replacement, undefined);
        await journal.close();
    }
});

test("malformed, oversized and failed inference become a retained human escalation", async (t) => {
    for (const model of [
        async () => ({ ...proposal, tools: ["publish"] }),
        async () => ({ ...proposal, text: "界".repeat(20000) }),
        async () => {
            throw new Error("provider-key must never reach summary");
        },
    ]) {
        const dir = await temporary(t),
            journal = await privateJournal(dir);
        const { site, calls } = workflow();
        await runOnce({ config, journal, site, model });
        const result = calls.at(-1).request.result;
        assert.equal(result.kind, "escalation");
        assert(!JSON.stringify(result).includes("provider-key"));
        await journal.close();
    }
});

test("crashed inference refuses a second call; different grant cannot consume pending intent", async (t) => {
    const { dir, journal } = await opened(t);
    const { site } = workflow();
    const originalWrite = journal.write;
    journal.write = async (value) => {
        if (value.kind === "prepared") throw Error("disk failed");
        return originalWrite(value);
    };
    await assert.rejects(
        runOnce({ config, journal, site, model: async () => proposal }),
    );
    assert.equal(
        JSON.parse(await fs.readFile(path.join(dir, "pending.json"))).kind,
        "inference-started",
    );
    const noWork = async () => {
        assert.fail("must not issue a request");
    };
    await assert.rejects(
        runOnce({ config, journal, site: noWork, model: noWork }),
        { code: "inference-needs-review" },
    );
    await assert.rejects(
        runOnce({
            config: { ...config, grant: "different" },
            journal,
            site: noWork,
            model: noWork,
        }),
        { code: "journal-credential-mismatch" },
    );
});

test("mismatched receipt leaves prepared result for operator review", async (t) => {
    const { journal } = await opened(t);
    const { site } = workflow({
        result: () => ({ ...receipt, feedbackId: "different" }),
    });
    await assert.rejects(
        runOnce({ config, journal, site, model: async () => proposal }),
        { code: "unconfirmed-result" },
    );
    assert.equal((await journal.read()).kind, "prepared");
});

test("empty inbox and recovered server intent invoke no model; malformed claim is refused", async (t) => {
    const { journal } = await opened(t),
        model = () => assert.fail("no inference expected");
    assert.deepEqual(
        await runOnce({
            config,
            journal,
            site: async () => ({ claim: null }),
            model,
        }),
        { kind: "idle" },
    );
    assert.equal(
        (
            await runOnce({
                config,
                journal,
                site: async () => ({ recovered: receipt }),
                model,
            })
        ).kind,
        "recovered",
    );
    await assert.rejects(
        runOnce({
            config,
            journal,
            site: async () => ({ claim: null, recovered: receipt }),
            model,
        }),
        { code: "invalid-claim" },
    );
    await assert.rejects(
        runOnce({
            config,
            journal,
            site: async () => ({ recovered: { ...receipt, feedbackId: 12 } }),
            model,
        }),
        { code: "unconfirmed-result" },
    );
});

test("stale/mismatched context cannot invoke inference or acceptance", async (t) => {
    const { journal } = await opened(t),
        model = () => assert.fail("no inference");
    const stale = workflow({
        claim: () => ({
            claim: { ...lease, leaseUntil: new Date().toISOString() },
        }),
    });
    await assert.rejects(
        runOnce({ config, journal, site: stale.site, model }),
        { code: "lease-too-short" },
    );
    const wrong = workflow({
        context: () => ({ ...context, inputHash: "b".repeat(64) }),
    });
    await assert.rejects(
        runOnce({ config, journal, site: wrong.site, model }),
        { code: "context-mismatch" },
    );
    assert.equal(await journal.read(), null);
});
