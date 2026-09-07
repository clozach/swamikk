import { readFile } from "fs/promises";
import mongoose from "mongoose";
import { prepareRetentionRecovery, applyRetentionRecovery } from "./index";
import { ContentChangeError } from "../content-changes/errors";

/** Build this maintenance entry from the same reviewed commit as the deployed application. */
async function main() {
    const [action, requestPath, receiptPath] = process.argv.slice(2);
    if (
        !["dry-run", "apply"].includes(action) ||
        !requestPath ||
        (action === "apply" && !receiptPath)
    )
        throw new Error("usage");
    const uri = process.env.DB_CONNECTION_STRING;
    if (!uri) throw new Error("database-unavailable");
    const input = JSON.parse(await readFile(requestPath, "utf8"));
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const result =
        action === "dry-run"
            ? await prepareRetentionRecovery(input)
            : await applyRetentionRecovery({
                  ...input,
                  receipt: JSON.parse(await readFile(receiptPath, "utf8")),
              });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
main()
    .catch((error) => {
        process.stderr.write(
            `${JSON.stringify({ error: error instanceof ContentChangeError ? { code: error.code, message: error.message } : { code: "unavailable", message: "Recovery did not complete. Inspect current state before retrying." } })}\n`,
        );
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
