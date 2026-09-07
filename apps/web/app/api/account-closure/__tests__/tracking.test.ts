import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import Domain from "@/models/Domain";
import User from "@/models/User";
import Sequence from "@/models/Sequence";
import Event from "@/models/EmailEvent";
import { jwtUtils } from "@courselit/common-logic";
import { GET as open } from "../../track/open/route";
import { GET as click } from "../../track/click/route";
import {
    beginAccountClosure,
    requireAccountErasureReady,
} from "../../../../../../packages/common-logic/src/account-lifecycle/gate";

jest.mock("@/services/logger", () => ({ error: jest.fn() }));
let domain: any, user: any, payload: any;
beforeEach(async () => {
    process.env.PIXEL_SIGNING_SECRET = "account-tracking-test";
    const id = randomUUID();
    domain = await Domain.create({
        name: id,
        email: `owner-${id}@example.com`,
    });
    user = await User.create({
        domain: domain._id,
        userId: id,
        email: `${id}@example.com`,
        active: true,
    });
    await Sequence.create({
        domain: domain._id,
        sequenceId: id,
        title: "Newsletter",
        creatorId: "owner",
        type: "sequence",
        from: { name: "School", email: "sender@example.com" },
        emails: [
            {
                emailId: "email",
                subject: "News",
                published: true,
                content: {
                    content: [],
                    style: { colors: {}, typography: {}, structure: {} },
                    meta: {},
                },
            },
        ],
    });
    payload = {
        userId: id,
        sequenceId: id,
        emailId: "email",
        link: encodeURIComponent("https://school.example/products"),
        index: 0,
    };
    jest.spyOn(jwtUtils, "verifyToken").mockReturnValue(payload);
});
afterEach(() => jest.restoreAllMocks());
it.each([
    ["open", open],
    ["click", click],
] as const)(
    "fences %s tracking through its event write while preserving the response",
    async (name, handler) => {
        let entered!: () => void, release!: () => void;
        const reached = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const pending = new Promise<void>((resolve) => {
            release = resolve;
        });
        const create = Event.create.bind(Event);
        jest.spyOn(Event, "create").mockImplementationOnce(
            async (...args: any[]) => {
                entered();
                await pending;
                return (create as any)(...args);
            },
        );
        const request = new NextRequest(
            `https://school.example/api/track/${name}?d=token`,
            { headers: { domain: domain.name } },
        );
        const writing = handler(request);
        await reached;
        const key = { domainId: String(domain._id), userId: user.userId };
        const state = await beginAccountClosure(key);
        release();
        const result = await writing;
        expect(state.kind).toBe("pending");
        await requireAccountErasureReady(key);
        await Event.deleteMany({ domain: domain._id, userId: user.userId });
        expect(
            await Event.countDocuments({
                domain: domain._id,
                userId: user.userId,
            }),
        ).toBe(0);
        const afterClosing = await handler(request);
        expect(afterClosing.status).toBe(result.status);
        if (name === "click")
            expect(afterClosing.headers.get("location")).toBe(
                "https://school.example/products",
            );
    },
);
