import { processMailJob } from "../worker";
import { addMailJob } from "../handler";
import mailQueue from "../queue";
import { sendMail } from "../../mail";
import {
    claimDelivery,
    finishDelivery,
} from "../../../../../packages/common-logic/src/member-access/drip";
jest.mock("../account-mail", () => ({
    withMailAccounts: (_input: unknown, operation: () => Promise<unknown>) =>
        operation(),
}));

jest.mock("../queue", () => ({
    __esModule: true,
    default: { add: jest.fn() },
}));
jest.mock("bullmq", () => ({ Worker: jest.fn() }));
jest.mock("../../bullmq", () => ({
    registerWorkerEvents: jest.fn(),
    workerOptions: {},
}));
jest.mock("../../mail", () => ({ sendMail: jest.fn() }));
jest.mock("../../logger", () => ({ logger: { error: jest.fn() } }));
jest.mock("../../observability/posthog", () => ({
    captureError: jest.fn(),
    getDomainId: (id: string) => id,
}));
jest.mock(
    "../../../../../packages/common-logic/src/member-access/drip",
    () => ({ claimDelivery: jest.fn(), finishDelivery: jest.fn() }),
);

const job = {
    id: "job-1",
    data: {
        to: "member@example.com",
        from: "creator@example.com",
        subject: "Unlocked",
        body: "A section is available.",
        domainId: "domain-1",
        drip: { periodId: "period-1", deliveryId: "delivery-1" },
    },
};
beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(claimDelivery).mockResolvedValue({
        kind: "claimed",
        claimId: "claim-1",
    });
    jest.mocked(finishDelivery).mockResolvedValue(undefined);
    jest.mocked(sendMail).mockResolvedValue(undefined);
});

describe("drip mail worker", () => {
    it("does not send a queued message when cancellation beat the worker claim", async () => {
        jest.mocked(claimDelivery).mockResolvedValue({ kind: "skipped" });
        await processMailJob(job);
        expect(claimDelivery).toHaveBeenCalledWith(
            "domain-1",
            "period-1",
            "delivery-1",
        );
        expect(sendMail).not.toHaveBeenCalled();
        expect(finishDelivery).not.toHaveBeenCalled();
    });

    it("records successful delivery after SMTP completes", async () => {
        await processMailJob(job);
        expect(sendMail).toHaveBeenCalledWith({
            to: job.data.to,
            from: job.data.from,
            subject: job.data.subject,
            html: job.data.body,
            headers: undefined,
        });
        expect(finishDelivery).toHaveBeenCalledWith(
            "domain-1",
            "period-1",
            "delivery-1",
            "claim-1",
            "sent",
        );
        expect(
            jest.mocked(claimDelivery).mock.invocationCallOrder[0],
        ).toBeLessThan(jest.mocked(sendMail).mock.invocationCallOrder[0]);
    });

    it("marks an ambiguous SMTP failure uncertain and never automatically resends it", async () => {
        const error = new Error("connection lost after DATA");
        jest.mocked(sendMail).mockRejectedValueOnce(error);
        await expect(processMailJob(job)).rejects.toThrow(error);
        expect(finishDelivery).toHaveBeenCalledWith(
            "domain-1",
            "period-1",
            "delivery-1",
            "claim-1",
            "uncertain",
        );
        jest.mocked(claimDelivery).mockResolvedValue({ kind: "skipped" });
        await processMailJob(job);
        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("leaves a pre-claim database failure pending without attempting SMTP", async () => {
        jest.mocked(claimDelivery).mockRejectedValue(
            new Error("database unavailable"),
        );
        await expect(processMailJob(job)).rejects.toThrow(
            "database unavailable",
        );
        expect(sendMail).not.toHaveBeenCalled();
        expect(finishDelivery).not.toHaveBeenCalled();
    });

    it("fails closed for malformed provenance", async () => {
        await expect(
            processMailJob({
                ...job,
                data: { ...job.data, drip: { periodId: "period-1" } },
            }),
        ).rejects.toThrow();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it("keeps ordinary mail behavior unchanged", async () => {
        await processMailJob({
            ...job,
            data: { ...job.data, drip: undefined },
        });
        expect(sendMail).toHaveBeenCalledTimes(1);
        expect(claimDelivery).not.toHaveBeenCalled();
        expect(finishDelivery).not.toHaveBeenCalled();
    });
});

describe("drip job enqueue", () => {
    it("deduplicates recoverable pending intents and carries their provenance", async () => {
        await addMailJob({ ...job.data, to: [job.data.to] });
        expect(mailQueue.add).toHaveBeenCalledWith(
            "mail",
            expect.objectContaining({ drip: job.data.drip }),
            {
                jobId: "drip-period-1-delivery-1",
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
    });
    it("rejects a delivery intent with multiple recipients", async () => {
        await expect(
            addMailJob({
                ...job.data,
                to: ["one@example.com", "two@example.com"],
            }),
        ).rejects.toThrow("exactly one recipient");
        expect(mailQueue.add).not.toHaveBeenCalled();
    });
    it("retains ordinary recipient fanout and queue options", async () => {
        await addMailJob({
            ...job.data,
            drip: undefined,
            to: ["one@example.com", "two@example.com"],
        });
        expect(mailQueue.add).toHaveBeenCalledTimes(2);
        expect(
            jest
                .mocked(mailQueue.add)
                .mock.calls.every((call) => call.length === 2),
        ).toBe(true);
    });
});
