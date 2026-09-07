import { randomUUID } from "crypto";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import User from "@/models/User";
import { addMailJob } from "@/services/queue";
import { jwtUtils } from "@courselit/common-logic";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
jest.mock("@/services/logger", () => ({ error: jest.fn() }));
jest.mock("nodemailer", () => {
    process.env.EMAIL_HOST = "mock.invalid";
    process.env.EMAIL_USER = "fixture";
    process.env.EMAIL_PASS = "fixture";
    return {
        __esModule: true,
        default: { createTransport: jest.fn(() => ({ sendMail: jest.fn() })) },
    };
});
const smtp = (nodemailer.createTransport as jest.Mock).mock.results[0].value
    .sendMail as jest.Mock;
const originalFetch = global.fetch;
let user: any, mail: any;
beforeEach(async () => {
    smtp.mockReset().mockResolvedValue(undefined);
    process.env.COURSELIT_JWT_SECRET = "mail-test-key";
    const domain = new mongoose.Types.ObjectId();
    user = await User.create({
        domain,
        userId: randomUUID(),
        email: `${randomUUID()}@example.com`,
        active: true,
    });
    mail = {
        to: [user.email],
        from: "school@example.com",
        subject: "Access",
        body: "Private",
        account: { domainId: String(domain), userId: user.userId },
    };
    global.fetch = jest.fn().mockRejectedValue(new Error("queue unavailable"));
});
afterAll(() => {
    global.fetch = originalFetch;
});
it("does not use local SMTP after account closure", async () => {
    await beginAccountClosure(mail.account);
    await addMailJob(mail);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(smtp).not.toHaveBeenCalled();
});
it("does not turn an explicit queue account refusal into a fallback send", async () => {
    global.fetch = jest.fn().mockResolvedValue({
        status: 409,
        json: async () => ({
            code: "account_unavailable",
            error: "Account unavailable",
        }),
    });
    await addMailJob(mail);
    expect(smtp).not.toHaveBeenCalled();
});
it("does not bypass a non-JSON queue refusal using local SMTP", async () => {
    global.fetch = jest.fn().mockResolvedValue({
        status: 403,
        json: async () => {
            throw new Error("HTML refusal");
        },
    });
    await addMailJob(mail);
    expect(smtp).not.toHaveBeenCalled();
});
it("holds the recipient through an allowed fallback SMTP attempt", async () => {
    let release!: () => void, enter!: () => void;
    const reached = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const paused = new Promise<void>((resolve) => {
        release = resolve;
    });
    smtp.mockImplementationOnce(async () => {
        enter();
        await paused;
    });
    const writing = addMailJob(mail);
    await reached;
    const result = await beginAccountClosure(mail.account);
    release();
    await writing;
    expect(result.kind).toBe("pending");
});
it("binds new member mail identity in the signed token and passes stable provenance", async () => {
    global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ message: "Success" }),
    });
    await addMailJob(mail);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const token = options.headers.Authorization.split(" ")[1];
    expect(jwtUtils.verifyToken(token, "mail-test-key")).toMatchObject({
        user: { domain: mail.account.domainId, userId: user.userId },
    });
    expect(JSON.parse(options.body).account).toEqual({ userId: user.userId });
    expect(smtp).not.toHaveBeenCalled();
});
