import { ActivityType } from "@courselit/common-models";
import { jwtUtils } from "@courselit/common-logic";
import { error } from "./logger";
import nodemailer from "nodemailer";
import { responses } from "@/config/strings";
import {
    withAccountMail,
    type AccountMailIdentity,
} from "../../../packages/common-logic/src/account-lifecycle/mail";
import { AccountLifecycleError } from "../../../packages/common-logic/src/account-lifecycle/gate";

const queueServer = process.env.QUEUE_SERVER || "http://localhost:4000";

function getJwtSecret(): string {
    const jwtSecret = process.env.COURSELIT_JWT_SECRET;
    if (!jwtSecret) {
        throw new Error("COURSELIT_JWT_SECRET is not defined");
    }
    return jwtSecret;
}

const mailHost = process.env.EMAIL_HOST;
const mailUser = process.env.EMAIL_USER;
const mailPass = process.env.EMAIL_PASS;
const mailPort = process.env.EMAIL_PORT ? +process.env.EMAIL_PORT : 587;

let transporter: any;
interface MailProps {
    to: string[];
    subject: string;
    body: string;
    from: string;
    headers?: Record<string, string>;
    account?: AccountMailIdentity;
}
if (mailHost && mailUser && mailPass && mailPort) {
    transporter = nodemailer.createTransport({
        host: mailHost,
        port: mailPort,
        auth: {
            user: mailUser,
            pass: mailPass,
        },
    });
} else {
    transporter = {
        sendMail: async function ({
            to,
            from,
            subject,
            html,
        }: Pick<MailProps, "to" | "subject" | "from"> & { html?: string }) {
            console.log("Mail:", to, from, subject, html); // eslint-disable-line no-console
        },
    };
}

export async function addMailJob(mail: MailProps) {
    try {
        return mail.account
            ? await withAccountMail(mail.account, mail.to, () =>
                  queueMailOrFallback(mail),
              )
            : await queueMailOrFallback(mail);
    } catch (error) {
        // A deliberate account refusal is final; never convert it into SMTP.
        if (error instanceof AccountLifecycleError) return;
        throw error;
    }
}

async function queueMailOrFallback({
    to,
    from,
    subject,
    body,
    headers,
    account,
}: MailProps) {
    try {
        const jwtSecret = getJwtSecret();
        const token = jwtUtils.generateToken(
            {
                service: "app",
                ...(account
                    ? {
                          user: {
                              domain: account.domainId,
                              userId: account.userId,
                          },
                      }
                    : {}),
            },
            jwtSecret,
        );
        const response = await fetch(`${queueServer}/job/mail`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                to,
                from,
                subject,
                body,
                headers,
                ...(account
                    ? {
                          account: {
                              userId: account.userId,
                              actorUserId: account.actorUserId,
                          },
                      }
                    : {}),
            }),
        });
        // Authentication/policy refusals can be HTML or empty. Their status is
        // final even when the error body cannot be parsed.
        if (account && response.status >= 400 && response.status < 500) return;
        const jsonResponse = await response.json();
        if (account && jsonResponse.code === "account_unavailable") return;

        if (response.status !== 200) {
            throw new Error(jsonResponse.error);
        }
    } catch (err) {
        error(
            `Error adding mail job: ${err.message}`,
            account
                ? { domainId: account.domainId, userId: account.userId }
                : { to, from, subject, body },
        );

        let atLeastOneSuccessfulSend = false;
        for (const recipient of to) {
            try {
                await transporter.sendMail({
                    from,
                    to: recipient,
                    subject,
                    html: body,
                    headers,
                });
                atLeastOneSuccessfulSend = true;
            } catch (err: any) {
                error(`Error sending mail locally: ${err.message}`, {
                    stack: err.stack,
                });
            }
        }

        if (!atLeastOneSuccessfulSend) {
            throw new Error(responses.email_delivery_failed_for_all_recipients);
        }
    }
}

export async function addNotificationDispatchJob({
    domain,
    entityId,
    activityType,
    userId,
    entityTargetId,
    metadata = {},
}: {
    domain: string;
    entityId: string;
    activityType: ActivityType;
    userId: string;
    entityTargetId?: string;
    metadata?: Record<string, unknown>;
}) {
    try {
        const jwtSecret = getJwtSecret();
        const token = jwtUtils.generateToken(
            {
                service: "app",
                user: {
                    domain,
                    userId,
                },
            },
            jwtSecret,
        );
        const response = await fetch(
            `${queueServer}/job/dispatch-notification`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    activityType,
                    entityId,
                    entityTargetId,
                    metadata,
                }),
            },
        );
        const jsonResponse = await response.json();

        if (response.status !== 200) {
            throw new Error(jsonResponse.error);
        }
    } catch (err) {
        error(`Error adding notification dispatch job: ${err.message}`, {
            domain,
            entityId,
            activityType,
            userId,
            entityTargetId,
            metadata,
        });
    }
}
