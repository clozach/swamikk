import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { privateJournal } from "./journal.mjs";
import { temporary, receipt } from "./test-fixtures.mjs";

test("a second process cannot claim the same journal while its lock is held", async (t) => {
    const dir = await temporary(t),
        journal = await privateJournal(dir);
    try {
        await assert.rejects(privateJournal(dir), { code: "runner-locked" });
    } finally {
        await journal.close();
    }
    const reopened = await privateJournal(dir);
    await reopened.close();
});

test("nonprivate directory and symlink directory are refused", async (t) => {
    const dir = await temporary(t),
        shared = path.join(dir, "shared"),
        link = path.join(dir, "link");
    await fs.mkdir(shared, { mode: 0o755 });
    await fs.chmod(shared, 0o755);
    await assert.rejects(privateJournal(shared), {
        code: "state-directory-not-private",
    });
    await fs.symlink(dir, link);
    await assert.rejects(privateJournal(link), {
        code: "state-directory-not-private",
    });
});

test("pending symlink, permissive file, malformed and oversized JSON remain untouched and refused", async (t) => {
    const dir = await temporary(t),
        journal = await privateJournal(dir),
        pending = path.join(dir, "pending.json");
    try {
        const other = path.join(dir, "other");
        await fs.writeFile(other, "{}", { mode: 0o600 });
        await fs.symlink(other, pending);
        await assert.rejects(journal.read(), { code: "journal-unreadable" });
        assert.equal(await fs.readFile(other, "utf8"), "{}");
        await fs.unlink(pending);
        await fs.writeFile(pending, "{}", { mode: 0o644 });
        await fs.chmod(pending, 0o644);
        await assert.rejects(journal.read(), { code: "journal-unreadable" });
        await fs.chmod(pending, 0o600);
        await fs.writeFile(pending, "{");
        await assert.rejects(journal.read(), { code: "journal-unreadable" });
        await fs.writeFile(pending, " ".repeat(65537));
        await assert.rejects(journal.read(), { code: "journal-unreadable" });
    } finally {
        await journal.close();
    }
});

test("failed oversized write preserves original intent; receipt audit remains per review", async (t) => {
    const dir = await temporary(t),
        journal = await privateJournal(dir);
    try {
        await journal.write({ preserved: true });
        await assert.rejects(journal.write({ oversized: "界".repeat(30000) }), {
            code: "journal-too-large",
        });
        assert.deepEqual(await journal.read(), { preserved: true });
        await journal.complete(receipt);
        await journal.write({ next: true });
        await journal.complete({ ...receipt, generation: 2 });
        const files = await fs.readdir(dir);
        assert(files.includes("confirmed-feedback-fixture-1.json"));
        assert(files.includes("confirmed-feedback-fixture-2.json"));
        assert(!files.some((name) => name.startsWith(".write-")));
    } finally {
        await journal.close();
    }
});
