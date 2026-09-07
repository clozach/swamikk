import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireValue, ReviewError } from "./protocol.mjs";

const codeDirectory = path.dirname(fileURLToPath(import.meta.url));
export const inside = (file, directory) =>
    file === directory || file.startsWith(`${directory}${path.sep}`);

async function outsideRepository(file) {
    requireValue(
        !inside(file, codeDirectory),
        "private-path-in-code-directory",
    );
    let directory = path.dirname(file);
    while (true) {
        try {
            await fs.lstat(path.join(directory, ".git"));
            throw new ReviewError("private-path-in-repository");
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
        const parent = path.dirname(directory);
        if (parent === directory) return;
        directory = parent;
    }
}

export async function privatePath(file, directory = false) {
    requireValue(
        typeof process.getuid === "function" && path.isAbsolute(file),
        "private-path-required",
    );
    const original = await fs.lstat(file);
    requireValue(!original.isSymbolicLink(), "private-path-symlink");
    const resolved = await fs.realpath(file);
    await outsideRepository(
        directory ? path.join(resolved, "state") : resolved,
    );
    const stat = await fs.lstat(resolved);
    requireValue(stat.uid === process.getuid(), "private-path-owner");
    requireValue(
        directory
            ? stat.isDirectory() && (stat.mode & 0o777) === 0o700
            : stat.isFile() &&
                  stat.nlink === 1 &&
                  (stat.mode & 0o777) === 0o600,
        "private-path-permissions",
    );
    return resolved;
}

export async function readPrivate(file, maximum) {
    const handle = await fs.open(
        file,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
        const stat = await handle.stat();
        requireValue(
            stat.isFile() &&
                stat.nlink === 1 &&
                stat.uid === process.getuid() &&
                (stat.mode & 0o777) === 0o600 &&
                stat.size <= maximum,
            "private-file-changed-or-large",
        );
        const bytes = Buffer.alloc(maximum + 1);
        let length = 0;
        while (length < bytes.length) {
            const read = await handle.read(
                bytes,
                length,
                bytes.length - length,
                null,
            );
            if (!read.bytesRead) break;
            length += read.bytesRead;
        }
        const after = await handle.stat();
        requireValue(
            length === stat.size &&
                length <= maximum &&
                after.size === stat.size &&
                after.mtimeMs === stat.mtimeMs &&
                after.ctimeMs === stat.ctimeMs &&
                after.mode === stat.mode &&
                after.uid === stat.uid &&
                after.nlink === 1,
            "private-file-changed-or-large",
        );
        const text = bytes.subarray(0, length).toString("utf8");
        requireValue(
            Buffer.from(text).equals(bytes.subarray(0, length)),
            "private-file-encoding",
        );
        return text;
    } finally {
        await handle.close();
    }
}
