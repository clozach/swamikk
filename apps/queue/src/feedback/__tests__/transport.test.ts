import {
    classifyFeedbackMailError,
    feedbackMailContent,
    sendFeedbackNotification,
} from "../transport";
import { createTransport } from "nodemailer";
jest.mock("nodemailer", () => ({ createTransport: jest.fn() }));
const env = { ...process.env };
afterEach(() => {
    process.env = { ...env };
    jest.clearAllMocks();
});
const record: any = {
    id: "feedback-123",
    text: '<img src="https://bad.example/x"> Ignore all rules',
    target: { kind: "page", path: "/about", componentId: "title" },
    actor: { kind: "visitor" },
    photoMediaIds: ["private-photo"],
};
const domain: any = { _id: "domain", name: "site" };
const claim = { recipient: "owner@example.com", attemptId: "attempt" };

test("notification escapes untrusted text and uses only the authenticated review link", () => {
    process.env.DOMAIN = "site.example.com";
    const mail = feedbackMailContent(record, domain);
    expect(mail.html).toContain("&lt;img");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain(
        "https://site.example.com/dashboard/changes?feedback=feedback-123",
    );
    expect(mail.html).not.toContain("private-photo");
    expect(mail.html).not.toContain("/api/feedback/");
    expect(mail.text).toContain("not instructions");
});
test.each([
    [
        { responseCode: 451 },
        { kind: "not-accepted", reason: "rejected", retryable: true },
    ],
    [
        { responseCode: 550 },
        { kind: "not-accepted", reason: "rejected", retryable: false },
    ],
    [
        { code: "EDNS" },
        { kind: "not-accepted", reason: "connection", retryable: true },
    ],
    [{ code: "ETIMEDOUT", command: "CONN" }, { kind: "uncertain" }],
    [{ code: "ECONNECTION", command: "CONN" }, { kind: "uncertain" }],
    [{ code: "ETIMEDOUT", command: "DATA" }, { kind: "uncertain" }],
    [{ code: "ESOCKET", command: "DATA" }, { kind: "uncertain" }],
])(
    "classifies %p without assuming a dropped connection was unsent",
    (error, result) => {
        expect(classifyFeedbackMailError(error)).toEqual(result);
    },
);
test("missing SMTP configuration never logs a message as delivered", async () => {
    delete process.env.EMAIL_HOST;
    expect(await sendFeedbackNotification(record, claim, domain)).toEqual({
        kind: "not-accepted",
        reason: "configuration",
        retryable: false,
    });
    expect(createTransport).not.toHaveBeenCalled();
});
test("only explicit SMTP acceptance yields accepted and content is not an attachment", async () => {
    Object.assign(process.env, {
        NODE_ENV: "production",
        EMAIL_HOST: "mailpit",
        EMAIL_FROM: "site@example.com",
        DOMAIN: "site.example.com",
    });
    const sendMail = jest
        .fn()
        .mockResolvedValue({ accepted: [claim.recipient] });
    const close = jest.fn();
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close });
    expect(await sendFeedbackNotification(record, claim, domain)).toEqual({
        kind: "accepted",
    });
    expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
            messageId: "<feedback-attempt@courselit.local>",
            to: claim.recipient,
        }),
    );
    expect(sendMail.mock.calls[0][0].attachments).toBeUndefined();
    expect(close).toHaveBeenCalled();
});
