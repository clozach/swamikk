import pug from "pug";
import { getEmailFrom } from "@courselit/utils";
import MagicCodeEmailTemplate from "@/templates/magic-code-email";
import { addMailJob } from "@/services/queue";

const schoolName = (headers: Headers) =>
    headers.get("domaintitle") || headers.get("domain") || "";
const mailFrom = (headers: Headers) =>
    getEmailFrom({
        name: schoolName(headers),
        email: process.env.EMAIL_FROM || "",
    });
const escapeHtml = (value: string) =>
    value.replace(
        /[&<>"']/g,
        (char) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[char] as string,
    );

/** The same branded code mail sign-in uses, with copy for this moment. */
export async function sendCode(headers: Headers, to: string, code: string) {
    const host = headers.get("host");
    const proto = headers.get("x-forwarded-proto") || "http";
    const school = schoolName(headers);
    const heading = "Confirm your new sign-in email";
    const body = pug.render(MagicCodeEmailTemplate, {
        code,
        schoolName: school,
        heading,
        intro: `Site support is changing the sign-in address for your ${school} account to this address. Read this code to them, or enter it yourself, to confirm. It stays valid for ten minutes.`,
        logoUrl: host ? `${proto}://${host}/swami-kk-logo.png` : "",
        signatureUrl: host ? `${proto}://${host}/swami-signature.png` : "",
    });
    // No account binding: that fence only admits the account's current address,
    // and this code must reach the address that is not yet the account's.
    await addMailJob({
        to: [to],
        subject: school ? `${heading} — ${school}` : heading,
        body,
        from: mailFrom(headers),
    });
}

/** The address being left is told, so a member who did not ask can say so. */
export async function sendNotice(
    headers: Headers,
    to: string,
    change: { before: string; after: string },
    editId: string,
    at: string,
) {
    const school = schoolName(headers);
    const when = new Date(at).toUTCString();
    const body = [
        `<p>Site support changed the sign-in address for your ${escapeHtml(school)} account from ${escapeHtml(change.before)} to ${escapeHtml(change.after)} on ${escapeHtml(when)}.</p>`,
        "<p>Sign-in codes now go to the new address.</p>",
        "<p>If you did not ask for this, reply to this email.</p>",
    ].join("");
    await addMailJob({
        to: [to],
        subject: school
            ? `Your sign-in email was changed — ${school}`
            : "Your sign-in email was changed",
        body,
        from: mailFrom(headers),
        headers: { "Message-ID": `<member-edit-${editId}@courselit.local>` },
    });
}
