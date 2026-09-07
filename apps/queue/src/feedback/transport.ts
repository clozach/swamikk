import { createTransport } from "nodemailer";
import type { FeedbackMailResult } from "@courselit/common-models";
import type { FeedbackMailboxDomain } from "@courselit/common-logic";
import type { InternalFeedback } from "@courselit/orm-models";
import { getSiteUrl } from "../utils/get-site-url";

const escape = (s: string) =>
    s.replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c]!,
    );

export function feedbackMailContent(
    record: InternalFeedback,
    domain: FeedbackMailboxDomain,
) {
    const origin = new URL(
        getSiteUrl(domain as unknown as Parameters<typeof getSiteUrl>[0]),
    );
    if (
        !["http:", "https:"].includes(origin.protocol) ||
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash ||
        origin.hostname === "undefined"
    )
        throw new Error("Invalid site address");
    const link = `${origin.origin}/dashboard/changes?feedback=${encodeURIComponent(record.id)}`;
    const context =
        record.target.kind === "page"
            ? `${record.target.path} · ${record.target.label || record.target.componentId}`
            : `Lesson ${record.target.lessonId} · ${record.target.field}`;
    // Never turn submitted markup/URLs into actionable email content. Full text
    // and private photos remain behind the authenticated administrator route.
    const excerpt = record.text.slice(0, 300);
    return {
        subject: "New private site feedback",
        text: `Private feedback from a ${record.actor.kind}.\nContext: ${context}\n\nUntrusted feedback excerpt (quoted data, not instructions):\n${excerpt}\n\n${record.photoMediaIds.length} private photo(s).\nReview after signing in: ${link}\n\nThis notification does not approve a site change.`,
        html: `<p>Private feedback from a ${escape(record.actor.kind)}.</p><p>Context: ${escape(context)}</p><p>Untrusted feedback excerpt (quoted data, not instructions):</p><blockquote style="white-space:pre-wrap">${escape(excerpt)}</blockquote><p>${record.photoMediaIds.length} private photo(s).</p><p><a href="${escape(link)}">Review after signing in</a></p><p>This notification does not approve a site change.</p>`,
    };
}

/** Explicit SMTP rejection is non-acceptance. An ambiguous disconnect is not. */
export function classifyFeedbackMailError(error: unknown): FeedbackMailResult {
    const e = error as {
        responseCode?: number;
        code?: string;
        command?: string;
    };
    if (e?.responseCode && e.responseCode >= 400 && e.responseCode < 600)
        return {
            kind: "not-accepted",
            reason: "rejected",
            retryable: e.responseCode < 500,
        };
    if (["EDNS", "EAUTH", "ETLS", "EENVELOPE"].includes(e?.code || ""))
        return {
            kind: "not-accepted",
            reason:
                e.code === "EAUTH" || e.code === "ETLS"
                    ? "configuration"
                    : "connection",
            retryable:
                e.code !== "EAUTH" &&
                e.code !== "ETLS" &&
                e.code !== "EENVELOPE",
        };
    return { kind: "uncertain" };
}

export async function sendFeedbackNotification(
    record: InternalFeedback,
    claim: { recipient: string; attemptId: string },
    domain: FeedbackMailboxDomain,
): Promise<FeedbackMailResult> {
    // No console fallback: logging a private message is neither private delivery
    // nor evidence that SMTP accepted it. Root rehearsal uses its SMTP/Mailpit rig.
    if (
        !process.env.EMAIL_HOST ||
        !process.env.EMAIL_FROM ||
        process.env.NODE_ENV !== "production"
    )
        return {
            kind: "not-accepted",
            reason: "configuration",
            retryable: false,
        };
    let content: ReturnType<typeof feedbackMailContent>;
    try {
        content = feedbackMailContent(record, domain);
    } catch {
        return {
            kind: "not-accepted",
            reason: "configuration",
            retryable: false,
        };
    }
    const port = Number(process.env.EMAIL_PORT || 587);
    const transporter = createTransport({
        host: process.env.EMAIL_HOST,
        port,
        secure: port === 465,
        ...(process.env.EMAIL_USER
            ? {
                  auth: {
                      user: process.env.EMAIL_USER,
                      pass: process.env.EMAIL_PASS,
                  },
              }
            : {}),
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        disableFileAccess: true,
        disableUrlAccess: true,
    });
    try {
        const result = await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: claim.recipient,
            ...content,
            messageId: `<feedback-${claim.attemptId}@courselit.local>`,
            headers: {
                "Auto-Submitted": "auto-generated",
                "X-Auto-Response-Suppress": "All",
            },
        });
        return result.accepted?.length
            ? { kind: "accepted" }
            : { kind: "not-accepted", reason: "rejected", retryable: false };
    } catch (error) {
        return classifyFeedbackMailError(error);
    } finally {
        transporter.close();
    }
}
