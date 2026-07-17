/**
 * @jest-environment node
 */

import { processRules } from "../process-rules";
import { processOngoingSequence } from "../process-ongoing-sequences/process-ongoing-sequence";
import OngoingSequenceModel from "../model/ongoing-sequence";
import DomainModel, { DomainDocument } from "../model/domain";
import SequenceModel from "../model/sequence";
import UserModel from "../model/user";
import RuleModel from "../model/rule";
import EmailDelivery from "../model/email-delivery";
import * as mail from "../../mail";
import { Constants } from "@courselit/common-models";
import { jwtUtils } from "@courselit/common-logic";
import { getEmailFrom } from "@courselit/utils";
import { getUnsubLink } from "../../utils/get-unsub-link";
import { getSiteUrl } from "../../utils/get-site-url";

// Mock dependencies
jest.mock("../../mail");
jest.mock("@courselit/utils");
jest.mock("../../utils/get-unsub-link");
jest.mock("../../utils/get-site-url");
jest.mock("../../logger", () => ({
    logger: {
        error: jest.fn(),
    },
}));

// Mock liquidjs - actually process basic Liquid templates for testing
jest.mock("liquidjs", () => {
    return {
        Liquid: jest.fn().mockImplementation(() => ({
            parseAndRender: jest.fn(async (template: string, payload: any) => {
                let result = template;
                if (payload) {
                    if (payload.subscriber?.name) {
                        result = result.replace(
                            /\{\{subscriber\.name\}\}/g,
                            payload.subscriber.name,
                        );
                    }
                    if (payload.unsubscribe_link) {
                        result = result.replace(
                            /\{\{unsubscribe_link\}\}/g,
                            payload.unsubscribe_link,
                        );
                    }
                    if (payload.address) {
                        result = result.replace(
                            /\{\{address\}\}/g,
                            payload.address,
                        );
                    }
                }
                return result;
            }),
        })),
    };
});

const mockedSendMail = mail.sendMail as jest.MockedFunction<
    typeof mail.sendMail
>;
const mockedGetEmailFrom = getEmailFrom as jest.MockedFunction<
    typeof getEmailFrom
>;
const mockedJwtUtils = jwtUtils as jest.Mocked<typeof jwtUtils>;
const mockedGetUnsubLink = getUnsubLink as jest.MockedFunction<
    typeof getUnsubLink
>;
const mockedGetSiteUrl = getSiteUrl as jest.MockedFunction<typeof getSiteUrl>;

const STOP_LOOP_ERROR_MESSAGE = "stop-loop-after-first-iteration";
const COHORT_TAG = "cohort:queue-test-cohort-1";
const SEQUENCE_ID = "cohort-broadcast-seq-1";
const RULE_ID = "cohort-broadcast-rule-1";
const CREATOR_ID = "cohort-queue-creator";

const emailContent = (body: string) => ({
    content: [
        {
            id: "block-1",
            blockType: "text",
            settings: {
                content: body,
            },
        },
    ],
    style: {
        colors: {
            background: "#ffffff",
            foreground: "#000000",
            border: "#e2e8f0",
            accent: "#0284c7",
            accentForeground: "#ffffff",
        },
        typography: {
            header: { fontFamily: "Arial, sans-serif" },
            text: { fontFamily: "Arial, sans-serif" },
            link: { fontFamily: "Arial, sans-serif" },
        },
        interactives: {
            button: {},
            link: {},
        },
        structure: {
            page: { marginY: "20px" },
            section: {
                padding: { x: "24px", y: "16px" },
            },
        },
    },
    meta: {},
});

function mockStopLoopAfterFirstIteration() {
    const stopError = new Error(STOP_LOOP_ERROR_MESSAGE);
    const setTimeoutSpy = jest
        .spyOn(global, "setTimeout")
        .mockImplementation(() => {
            throw stopError;
        });
    return { stopError, setTimeoutSpy };
}

describe("cohort broadcast pipeline (rule -> recipients -> delivery)", () => {
    let testDomain: DomainDocument;

    const createUser = async (
        suffix: string,
        { tagged, subscribed }: { tagged: boolean; subscribed: boolean },
    ) =>
        await (UserModel.create as any)({
            domain: testDomain._id,
            userId: `cohort-queue-user-${suffix}`,
            name: `Cohort User ${suffix}`,
            email: `cohort-queue-user-${suffix}@example.com`,
            active: true,
            subscribedToUpdates: subscribed,
            unsubscribeToken: `cohort-unsub-${suffix}`,
            tags: tagged ? [COHORT_TAG] : [],
        });

    beforeAll(async () => {
        process.env.PIXEL_SIGNING_SECRET = "test-secret";
        process.env.PROTOCOL = "https";
        process.env.DOMAIN = "test.com";
        process.env.NODE_ENV = "test";
        process.env.EMAIL_FROM = "verified-sender@example.com";

        testDomain = await (DomainModel.create as any)({
            name: "cohort-queue-test-domain",
            settings: {
                mailingAddress: "12 Queue Lane, Testville",
            },
            quota: {
                mail: {
                    daily: 1000,
                    monthly: 30000,
                    dailyCount: 0,
                    monthlyCount: 0,
                },
            },
        });

        await (UserModel.create as any)({
            domain: testDomain._id,
            userId: CREATOR_ID,
            name: "Cohort Creator",
            email: "cohort-queue-creator@example.com",
            active: true,
            subscribedToUpdates: true,
            unsubscribeToken: "cohort-unsub-creator",
            tags: [],
        });
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockedGetSiteUrl.mockReturnValue("https://test.com");
        mockedGetUnsubLink.mockReturnValue(
            "https://test.com/api/unsubscribe/token",
        );
        mockedGetEmailFrom.mockImplementation(
            ({ name, email }: any) => `${name} <${email}>`,
        );
        mockedJwtUtils.generateToken = jest.fn().mockReturnValue("test-token");
        mockedSendMail.mockResolvedValue(undefined);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await OngoingSequenceModel.deleteMany({ domain: testDomain._id });
        await SequenceModel.deleteMany({ domain: testDomain._id });
        await RuleModel.deleteMany({ domain: testDomain._id });
        await EmailDelivery.deleteMany({ domain: testDomain._id });
        await UserModel.deleteMany({
            domain: testDomain._id,
            userId: { $ne: CREATOR_ID },
        });
    });

    afterAll(async () => {
        await UserModel.deleteMany({ domain: testDomain._id });
        await DomainModel.deleteMany({ _id: testDomain._id });
    });

    const seedBroadcast = async ({
        sequenceId,
        ruleId,
        tag,
        firedAt,
    }: {
        sequenceId: string;
        ruleId: string;
        tag: string;
        firedAt: number;
    }) => {
        await (SequenceModel.create as any)({
            domain: testDomain._id,
            sequenceId,
            creatorId: CREATOR_ID,
            type: "broadcast",
            title: "Cohort announcement",
            status: "active",
            filter: {
                aggregator: "or",
                filters: [
                    {
                        name: "tag",
                        condition: "Has",
                        value: tag,
                    },
                ],
            },
            trigger: {
                type: Constants.EventType.DATE_OCCURRED,
            },
            emails: [
                {
                    emailId: "cohort-email-1",
                    subject: "Hello cohort",
                    published: true,
                    delayInMillis: firedAt,
                    content: emailContent(
                        "Hello {{subscriber.name}} {{unsubscribe_link}} {{address}}",
                    ),
                },
            ],
            emailsOrder: ["cohort-email-1"],
            report: {
                sequence: {
                    failed: [],
                },
            },
        });
        await (RuleModel.create as any)({
            domain: testDomain._id,
            ruleId,
            event: Constants.EventType.DATE_OCCURRED,
            sequenceId,
            eventDateInMillis: firedAt,
        });
    };

    it("delivers a scheduled cohort broadcast to exactly the tagged, subscribed members", async () => {
        const memberA = await createUser("a", {
            tagged: true,
            subscribed: true,
        });
        const memberB = await createUser("b", {
            tagged: true,
            subscribed: true,
        });
        // Tagged but unsubscribed: must never receive anything
        const memberC = await createUser("c", {
            tagged: true,
            subscribed: false,
        });
        // Subscribed but not in the cohort: must never receive anything
        await createUser("d", { tagged: false, subscribed: true });

        const firedAt = Date.now() - 60 * 1000;
        await seedBroadcast({
            sequenceId: SEQUENCE_ID,
            ruleId: RULE_ID,
            tag: COHORT_TAG,
            firedAt,
        });

        // Stage 1: the 60s rule poll materializes the audience
        const { stopError } = mockStopLoopAfterFirstIteration();
        await expect(processRules()).rejects.toThrow(stopError);
        jest.restoreAllMocks();

        const ongoing = await OngoingSequenceModel.find({
            sequenceId: SEQUENCE_ID,
        }).sort({ _id: 1 });
        expect(ongoing.map((doc) => doc.userId).sort()).toEqual(
            [memberA.userId, memberB.userId].sort(),
        );

        const sequence: any = await SequenceModel.findOne({
            sequenceId: SEQUENCE_ID,
        });
        expect(sequence.entrants.sort()).toEqual(
            [memberA.userId, memberB.userId].sort(),
        );
        expect(sequence.report.broadcast.lockedAt).toBeTruthy();
        expect(sequence.report.broadcast.sentAt).toBeFalsy();
        expect(await RuleModel.findOne({ ruleId: RULE_ID })).toBeNull();

        // Stage 2: sending
        for (const doc of ongoing) {
            await processOngoingSequence(doc._id as any);
        }

        const deliveries = await EmailDelivery.find({
            sequenceId: SEQUENCE_ID,
        });
        expect(deliveries.map((delivery) => delivery.userId).sort()).toEqual(
            [memberA.userId, memberB.userId].sort(),
        );
        expect(mockedSendMail).toHaveBeenCalledTimes(2);
        const recipients = mockedSendMail.mock.calls
            .map((call: any[]) => call[0].to)
            .sort();
        expect(recipients).toEqual([memberA.email, memberB.email].sort());
        expect(
            mockedSendMail.mock.calls.some((call: any[]) =>
                call[0].to.includes(memberC.email),
            ),
        ).toBe(false);

        // Single-email broadcast fully delivered: sentAt stamped
        const finished: any = await SequenceModel.findOne({
            sequenceId: SEQUENCE_ID,
        });
        expect(finished.report.broadcast.sentAt).toBeTruthy();
        expect(
            await OngoingSequenceModel.find({ sequenceId: SEQUENCE_ID }),
        ).toHaveLength(0);
    });

    it("delivers to every member even when docs are processed out of order", async () => {
        const memberA = await createUser("a", {
            tagged: true,
            subscribed: true,
        });
        const memberB = await createUser("b", {
            tagged: true,
            subscribed: true,
        });

        const firedAt = Date.now() - 60 * 1000;
        await seedBroadcast({
            sequenceId: `${SEQUENCE_ID}-ooo`,
            ruleId: `${RULE_ID}-ooo`,
            tag: COHORT_TAG,
            firedAt,
        });

        const { stopError } = mockStopLoopAfterFirstIteration();
        await expect(processRules()).rejects.toThrow(stopError);
        jest.restoreAllMocks();

        const ongoing = await OngoingSequenceModel.find({
            sequenceId: `${SEQUENCE_ID}-ooo`,
        }).sort({ _id: 1 });
        expect(ongoing).toHaveLength(2);

        // Newest first: cleanup used to deleteOne({sequenceId}), which
        // removed the OLDEST doc — dropping the other member silently.
        for (const doc of [...ongoing].reverse()) {
            await processOngoingSequence(doc._id as any);
        }

        const deliveries = await EmailDelivery.find({
            sequenceId: `${SEQUENCE_ID}-ooo`,
        });
        expect(deliveries.map((delivery) => delivery.userId).sort()).toEqual(
            [memberA.userId, memberB.userId].sort(),
        );
        expect(mockedSendMail).toHaveBeenCalledTimes(2);
    });

    it("does not fire a rule scheduled in the future", async () => {
        await createUser("g", { tagged: true, subscribed: true });
        const future = Date.now() + 3600 * 1000;
        await seedBroadcast({
            sequenceId: `${SEQUENCE_ID}-future`,
            ruleId: `${RULE_ID}-future`,
            tag: COHORT_TAG,
            firedAt: future,
        });

        const { stopError } = mockStopLoopAfterFirstIteration();
        await expect(processRules()).rejects.toThrow(stopError);
        jest.restoreAllMocks();

        expect(
            await OngoingSequenceModel.find({
                sequenceId: `${SEQUENCE_ID}-future`,
            }),
        ).toHaveLength(0);
        expect(
            await RuleModel.findOne({ ruleId: `${RULE_ID}-future` }),
        ).not.toBeNull();
        const sequence: any = await SequenceModel.findOne({
            sequenceId: `${SEQUENCE_ID}-future`,
        });
        expect(sequence.report?.broadcast?.lockedAt).toBeFalsy();
    });

    it("skips a member who unsubscribes between fire time and send time", async () => {
        const memberE = await createUser("e", {
            tagged: true,
            subscribed: true,
        });
        const memberF = await createUser("f", {
            tagged: true,
            subscribed: true,
        });

        const firedAt = Date.now() - 60 * 1000;
        await seedBroadcast({
            sequenceId: `${SEQUENCE_ID}-2`,
            ruleId: `${RULE_ID}-2`,
            tag: COHORT_TAG,
            firedAt,
        });

        const { stopError } = mockStopLoopAfterFirstIteration();
        await expect(processRules()).rejects.toThrow(stopError);
        jest.restoreAllMocks();

        const ongoing = await OngoingSequenceModel.find({
            sequenceId: `${SEQUENCE_ID}-2`,
        }).sort({ _id: 1 });
        expect(ongoing).toHaveLength(2);

        // memberF unsubscribes after the audience snapshot, before sending
        await (UserModel.updateOne as any)(
            { userId: memberF.userId },
            { $set: { subscribedToUpdates: false } },
        );

        for (const doc of ongoing) {
            await processOngoingSequence(doc._id as any);
        }

        const deliveries = await EmailDelivery.find({
            sequenceId: `${SEQUENCE_ID}-2`,
        });
        expect(deliveries.map((delivery) => delivery.userId)).toEqual([
            memberE.userId,
        ]);
        expect(mockedSendMail).toHaveBeenCalledTimes(1);
        expect(mockedSendMail.mock.calls[0][0].to).toContain(memberE.email);
    });
});
