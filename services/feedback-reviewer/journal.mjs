import { promises as fs, constants } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { requireValue, ReviewError } from "./protocol.mjs";

export async function privateJournal(directory) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    requireValue(
        stat.isDirectory() &&
            !stat.isSymbolicLink() &&
            !(stat.mode & 0o077) &&
            (typeof process.getuid !== "function" ||
                stat.uid === process.getuid()),
        "state-directory-not-private",
    );
    const pending = path.join(directory, "pending.json");
    const lock = path.join(directory, "run.lock");
    let handle;
    try {
        handle = await fs.open(lock, "wx", 0o600);
    } catch {
        throw new ReviewError("runner-locked");
    }
    try {
        await handle.writeFile(
            JSON.stringify({
                pid: process.pid,
                startedAt: new Date().toISOString(),
            }),
        );
        await handle.sync();
    } catch (error) {
        await handle.close();
        await fs.unlink(lock);
        throw error;
    }

    async function syncDirectory() {
        const folder = await fs.open(directory, "r");
        try {
            await folder.sync();
        } finally {
            await folder.close();
        }
    }

    async function atomic(name, value) {
        const temporary = path.join(directory, `.write-${randomUUID()}`);
        const encoded = JSON.stringify(value);
        requireValue(Buffer.byteLength(encoded) <= 65536, "journal-too-large");
        try {
            const file = await fs.open(temporary, "wx", 0o600);
            try {
                await file.writeFile(encoded);
                await file.sync();
            } finally {
                await file.close();
            }
            await fs.rename(temporary, path.join(directory, name));
            await syncDirectory();
        } finally {
            await fs.unlink(temporary).catch((error) => {
                if (error.code !== "ENOENT") throw error;
            });
        }
    }

    return {
        async read() {
            let file;
            try {
                file = await fs.open(
                    pending,
                    constants.O_RDONLY | constants.O_NOFOLLOW,
                );
            } catch (error) {
                if (error.code === "ENOENT") return null;
                throw new ReviewError("journal-unreadable");
            }
            try {
                const info = await file.stat();
                requireValue(
                    info.isFile() &&
                        !(info.mode & 0o077) &&
                        info.size <= 65536 &&
                        (typeof process.getuid !== "function" ||
                            info.uid === process.getuid()),
                    "journal-unreadable",
                );
                return JSON.parse(await file.readFile("utf8"));
            } catch {
                throw new ReviewError("journal-unreadable");
            } finally {
                await file.close();
            }
        },
        write(value) {
            return atomic("pending.json", value);
        },
        async complete(receipt) {
            requireValue(
                typeof receipt.feedbackId === "string" &&
                    /^[\w-]{1,128}$/.test(receipt.feedbackId) &&
                    Number.isSafeInteger(receipt.generation) &&
                    receipt.generation > 0,
                "invalid-receipt",
            );
            await atomic(
                `confirmed-${receipt.feedbackId}-${receipt.generation}.json`,
                receipt,
            );
            await fs.unlink(pending);
            await syncDirectory();
        },
        async close() {
            await handle.close();
            await fs.unlink(lock);
        },
    };
}
