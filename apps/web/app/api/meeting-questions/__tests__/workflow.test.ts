import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import type {
    MeetingAnswerInput,
    MeetingAnswerSaveResult,
    MeetingQuestionSetInput,
    MeetingQuestionsSnapshot,
} from "@courselit/common-models";
import { auth } from "@/auth";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import {
    MeetingQuestionAnswerModel,
    MeetingQuestionSetModel,
} from "@/services/meeting-questions/models";
import { redactMeetingQuestionAuthor } from "@/services/meeting-questions/cleanup";
import { withAccountWrite } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { GET, POST } from "../route";
import { POST as answerPost } from "../answers/route";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));

const endpoint = "/api/meeting-questions";
const origin = "https://meeting.example";
let fixtures: Awaited<ReturnType<typeof makeFixtures>>;

async function makeFixtures() {
    const suffix = randomUUID();
    const domain = await DomainModel.create({
        name: `meeting-${suffix}`,
        email: `owner-${suffix}@example.com`,
    });
    const otherDomain = await DomainModel.create({
        name: `meeting-other-${suffix}`,
        email: `other-owner-${suffix}@example.com`,
    });
    const makeUser = (
        name: string,
        permissions: string[],
        active = true,
        tenant = domain,
    ) =>
        UserModel.create({
            domain: tenant._id,
            userId: randomUUID(),
            email: `${name.toLowerCase()}-${suffix}@example.com`,
            name,
            active,
            permissions,
            unsubscribeToken: randomUUID(),
        });
    return {
        domain,
        otherDomain,
        admin: await makeUser("Al", ["site:manage"]),
        editor: await makeUser("Karuna", ["course:manage_any"]),
        member: await makeUser("Member", []),
        inactive: await makeUser("Inactive", ["site:manage"], false),
        foreign: await makeUser("Foreign", ["site:manage"], true, otherDomain),
    };
}

function setInput(): MeetingQuestionSetInput {
    return {
        id: "meeting-september",
        title: "Meeting questions",
        intro: "Record the choices we make together.",
        questions: [
            {
                id: "welcome",
                number: 1,
                title: "What should the welcome say?",
                group: "start",
                context: "This appears beside the welcome.",
                candidateGroups: [
                    {
                        title: "Opening",
                        options: [
                            { label: "Warm", text: "Welcome to the practice." },
                        ],
                    },
                ],
                locations: [
                    { path: "/", componentId: "welcome", label: "Welcome" },
                ],
            },
        ],
    };
}

function answerInput(
    text = "A warm welcome",
    expectedRevision = 0,
): MeetingAnswerInput {
    return {
        setId: "meeting-september",
        questionId: "welcome",
        text,
        expectedRevision,
        mutationId: randomUUID(),
    };
}

function request(
    path = endpoint,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
) {
    return new NextRequest(`${origin}${path}`, {
        method,
        headers: {
            domain: fixtures.domain.name,
            host: "meeting.example",
            origin,
            "content-type": "application/json",
            "x-test-session-email": fixtures.admin.email,
            ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

const asEditor = () => ({ "x-test-session-email": fixtures.editor.email });
const asForeign = () => ({
    domain: fixtures.otherDomain.name,
    "x-test-session-email": fixtures.foreign.email,
});
const writeSet = (
    set = setInput(),
    expectedRevision = 0,
    headers: Record<string, string> = {},
) => POST(request(endpoint, "POST", { set, expectedRevision }, headers));
const writeAnswer = (
    input = answerInput(),
    headers: Record<string, string> = {},
) => answerPost(request(`${endpoint}/answers`, "POST", input, headers));
async function snapshot(
    headers: Record<string, string> = {},
): Promise<MeetingQuestionsSnapshot> {
    const response = await GET(request(endpoint, "GET", undefined, headers));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    return response.json();
}
async function seed() {
    const response = await writeSet();
    expect(response.status).toBeLessThan(300);
    return (await response.json()).set;
}
async function saved(
    input = answerInput(),
    headers: Record<string, string> = {},
) {
    const response = await writeAnswer(input, headers);
    expect(response.status).toBe(200);
    const result = (await response.json()) as MeetingAnswerSaveResult;
    expect(result.kind).toBe("saved");
    if (result.kind !== "saved") throw new Error("Expected a saved answer");
    return result;
}

beforeEach(async () => {
    jest.clearAllMocks();
    fixtures = await makeFixtures();
    // Identity is request-local so concurrent authors cannot race a global auth stub.
    (auth.api.getSession as unknown as jest.Mock).mockImplementation(
        async (options: Parameters<typeof auth.api.getSession>[0]) => {
            const email = new Headers(options?.headers).get(
                "x-test-session-email",
            );
            return email ? { user: { email } } : null;
        },
    );
});

afterEach(async () => {
    jest.restoreAllMocks();
    const domain = { $in: [fixtures.domain._id, fixtures.otherDomain._id] };
    await MeetingQuestionAnswerModel.deleteMany({ domain });
    await MeetingQuestionSetModel.deleteMany({ domain });
    await UserModel.deleteMany({ domain });
    await DomainModel.deleteMany({ _id: domain });
});

describe("meeting question route access and set publication", () => {
    test("both existing manager permissions can read and publish; the viewer comes from the session", async () => {
        expect(await snapshot()).toEqual({
            sets: [],
            answers: [],
            viewer: { userId: fixtures.admin.userId, name: "Al" },
        });
        const response = await writeSet(setInput(), 0, asEditor());
        expect(response.status).toBeLessThan(300);
        const view = await snapshot(asEditor());
        expect(view.viewer).toEqual({
            userId: fixtures.editor.userId,
            name: "Karuna",
        });
        expect(view.sets).toHaveLength(1);
        expect(view.sets[0]).toMatchObject({ ...setInput(), revision: 1 });
    });

    test("identical seed replay preserves revision; changed sets use compare-and-swap", async () => {
        const first = await seed();
        const replay = await writeSet();
        expect(replay.status).toBeLessThan(300);
        expect((await replay.json()).set).toEqual(first);
        const changed = { ...setInput(), intro: "Updated meeting context" };
        expect((await writeSet(changed, 0)).status).toBe(409);
        const update = await writeSet(changed, 1);
        expect(update.status).toBeLessThan(300);
        expect((await update.json()).set).toMatchObject({
            intro: changed.intro,
            revision: 2,
        });
        expect((await snapshot()).sets).toHaveLength(1);
    });

    test.each(["visitor", "member", "inactive"] as const)(
        "%s cannot read or write",
        async (kind) => {
            await seed();
            const headers = {
                "x-test-session-email":
                    kind === "visitor" ? "" : fixtures[kind].email,
            };
            for (const response of [
                await GET(request(endpoint, "GET", undefined, headers)),
                await writeSet(setInput(), 0, headers),
                await writeAnswer(answerInput(), headers),
            ])
                expect([401, 403]).toContain(response.status);
            expect((await snapshot()).answers).toEqual([]);
        },
    );

    test("another tenant sees no records and cannot answer this tenant's set", async () => {
        await seed();
        await saved();
        expect(await snapshot(asForeign())).toMatchObject({
            sets: [],
            answers: [],
        });
        expect((await writeAnswer(answerInput(), asForeign())).status).toBe(
            404,
        );
        expect(
            (
                await GET(
                    request(endpoint, "GET", undefined, {
                        domain: fixtures.otherDomain.name,
                    }),
                )
            ).status,
        ).toBe(401);
        const foreignSet = { ...setInput(), title: "Other tenant's meeting" };
        expect(
            (await writeSet(foreignSet, 0, asForeign())).status,
        ).toBeLessThan(300);
        await saved(answerInput("Other tenant's answer"), asForeign());
        const local = await snapshot();
        expect(local.sets[0].title).toBe(setInput().title);
        expect(local.answers.map((answer) => answer.text)).toEqual([
            "A warm welcome",
        ]);
    });

    test("Mimic cookies fail closed for every operation, including expired tokens", async () => {
        await seed();
        const headers = { cookie: "courselit.member-mimic=expired" };
        for (const response of [
            await GET(request(endpoint, "GET", undefined, headers)),
            await writeSet(setInput(), 0, headers),
            await writeAnswer(answerInput(), headers),
        ])
            expect(response.status).toBe(403);
        expect((await snapshot()).answers).toEqual([]);
    });

    test("cross-site GET requests cannot read private meeting questions", async () => {
        await seed();
        for (const headers of [
            { origin: "https://elsewhere.example" },
            { "sec-fetch-site": "cross-site" },
        ] as Record<string, string>[]) {
            const response = await GET(
                request(endpoint, "GET", undefined, headers),
            );
            expect(response.status).toBe(403);
            expect((await response.json()).sets).toBeUndefined();
        }
    });

    test.each(["set", "answer"])(
        "%s writes reject cross-origin or non-JSON requests",
        async (kind) => {
            await seed();
            for (const headers of [
                { origin: "https://foreign.example" },
                { "sec-fetch-site": "cross-site" },
                { "content-type": "text/plain" },
            ] as Record<string, string>[]) {
                const response =
                    kind === "set"
                        ? await writeSet(setInput(), 0, headers)
                        : await writeAnswer(answerInput(), headers);
                expect([403, 415]).toContain(response.status);
            }
        },
    );

    test("set validation rejects duplicate question IDs/numbers and unknown nested fields", async () => {
        const base = setInput();
        const first = base.questions[0];
        const invalid = [
            { ...base, questions: [first, { ...first, number: 2 }] },
            { ...base, questions: [first, { ...first, id: "other" }] },
            { ...base, questions: [{ ...first, group: "unknown" }] },
            {
                ...base,
                questions: [{ ...first, ownerId: fixtures.editor.userId }],
            },
            {
                ...base,
                questions: [
                    {
                        ...first,
                        locations: [
                            {
                                ...first.locations[0],
                                path: "https://foreign.example/",
                            },
                        ],
                    },
                ],
            },
            {
                ...base,
                questions: [
                    {
                        ...first,
                        candidateGroups: [
                            {
                                title: "Choice",
                                options: [
                                    { label: "A", text: "Text", secret: true },
                                ],
                            },
                        ],
                    },
                ],
            },
        ];
        for (const set of invalid) {
            const response = await POST(
                request(endpoint, "POST", { set, expectedRevision: 0 }),
            );
            expect(response.status).toBe(400);
        }
        expect((await snapshot()).sets).toEqual([]);
    });

    test("set request requires revision and rejects extra properties", async () => {
        for (const body of [
            { set: setInput() },
            { set: setInput(), expectedRevision: -1 },
            {
                set: setInput(),
                expectedRevision: 0,
                authorUserId: fixtures.editor.userId,
            },
        ])
            expect((await POST(request(endpoint, "POST", body))).status).toBe(
                400,
            );
    });

    test.each([
        ["set", 128 * 1024],
        ["answer", 12 * 1024],
    ] as const)(
        "%s enforces the streamed body byte limit without Content-Length",
        async (kind, limit) => {
            await seed();
            const body =
                kind === "set"
                    ? { set: setInput(), expectedRevision: 0 }
                    : answerInput();
            const base = request(
                kind === "set" ? endpoint : `${endpoint}/answers`,
                "POST",
            );
            const oversized = new NextRequest(base.url, {
                method: "POST",
                headers: base.headers,
                body: JSON.stringify(body) + " ".repeat(limit),
            });
            expect(oversized.headers.has("content-length")).toBe(false);
            expect(
                (
                    await (kind === "set"
                        ? POST(oversized)
                        : answerPost(oversized))
                ).status,
            ).toBe(413);
        },
    );
});

describe("per-author answers, concurrency and retained history", () => {
    beforeEach(seed);

    test("saves an attributed answer that the other manager can read", async () => {
        const result = await saved();
        expect(result).toMatchObject({
            kind: "saved",
            replayed: false,
            appliedRevision: 1,
            answer: {
                text: "A warm welcome",
                revision: 1,
                author: {
                    kind: "account",
                    userId: fixtures.admin.userId,
                    name: "Al",
                },
            },
        });
        expect((await snapshot(asEditor())).answers).toEqual([result.answer]);
    });

    test.each([0, 1])(
        "same-author racing saves at revision %i have one winner and one recoverable conflict",
        async (revision) => {
            if (revision) await saved(answerInput("First"));
            const responses = await Promise.all([
                writeAnswer(answerInput("Choice A", revision)),
                writeAnswer(answerInput("Choice B", revision)),
            ]);
            expect(responses.map((response) => response.status).sort()).toEqual(
                [200, 409],
            );
            const winner = await responses
                .find((response) => response.status === 200)!
                .json();
            const conflict = await responses
                .find((response) => response.status === 409)!
                .json();
            expect(conflict).toMatchObject({
                kind: "conflict",
                current: winner.answer,
            });
            expect(conflict.message).toEqual(expect.any(String));
            expect(winner.answer.revision).toBe(revision + 1);
            expect(winner.answer.history).toHaveLength(revision + 1);
            expect((await snapshot()).answers).toEqual([winner.answer]);
        },
    );

    test("two authors saving together keep separate editable answers", async () => {
        const [al, karuna] = await Promise.all([
            saved(answerInput("Al's answer")),
            saved(answerInput("Karuna's answer"), asEditor()),
        ]);
        expect(al.answer.id).not.toBe(karuna.answer.id);
        const changed = await saved(
            answerInput("Karuna's revised answer", 1),
            asEditor(),
        );
        const view = await snapshot();
        expect(view.answers).toHaveLength(2);
        expect(view.answers).toEqual(
            expect.arrayContaining([al.answer, changed.answer]),
        );
        expect(changed.answer.history.map((entry) => entry.text)).toEqual([
            "Karuna's answer",
            "Karuna's revised answer",
        ]);
    });

    test("mutation replay returns its original applied revision without rolling back a later answer", async () => {
        const firstInput = answerInput("First");
        const first = await saved(firstInput);
        const replay = await saved(firstInput);
        expect(replay).toMatchObject({
            replayed: true,
            appliedRevision: 1,
            answer: first.answer,
        });
        const latest = await saved(answerInput("Later", 1));
        const oldReplay = await saved(firstInput);
        expect(oldReplay).toMatchObject({
            replayed: true,
            appliedRevision: 1,
            answer: latest.answer,
        });
        expect((await snapshot()).answers).toEqual([latest.answer]);
    });

    test("concurrent identical mutation replays append exactly one history entry", async () => {
        const input = answerInput();
        const results = await Promise.all([saved(input), saved(input)]);
        expect(results.map((result) => result.replayed).sort()).toEqual([
            false,
            true,
        ]);
        expect(results.map((result) => result.appliedRevision)).toEqual([1, 1]);
        const view = await snapshot();
        expect(view.answers).toHaveLength(1);
        expect(view.answers[0].history).toHaveLength(1);
    });

    test("reusing a mutation ID with different text or base revision conflicts", async () => {
        const input = answerInput("Original");
        const first = await saved(input);
        for (const changed of [
            { ...input, text: "Different" },
            { ...input, expectedRevision: 1 },
        ]) {
            const response = await writeAnswer(changed);
            expect(response.status).toBe(409);
            expect(await response.json()).toMatchObject({
                kind: "conflict",
                current: first.answer,
            });
        }
        expect((await snapshot()).answers).toEqual([first.answer]);
    });

    test("restoring prefills an old text and saves a new revision without erasing history", async () => {
        const first = await saved(answerInput("Original"));
        await saved(answerInput("Revised", 1));
        const restored = await saved(answerInput(first.answer.text, 2));
        expect(restored.answer).toMatchObject({
            text: "Original",
            revision: 3,
        });
        expect(
            restored.answer.history.map((entry) => ({
                revision: entry.revision,
                baseRevision: entry.baseRevision,
                text: entry.text,
            })),
        ).toEqual([
            { revision: 1, baseRevision: 0, text: "Original" },
            { revision: 2, baseRevision: 1, text: "Revised" },
            { revision: 3, baseRevision: 2, text: "Original" },
        ]);
        expect(
            new Set(restored.answer.history.map((entry) => entry.mutationId))
                .size,
        ).toBe(3);
    });

    test("clearing an answer saves an empty revision while retaining its previous text", async () => {
        await saved(answerInput("Keep this in history"));
        const cleared = await saved(answerInput("", 1));
        expect(cleared.answer).toMatchObject({ text: "", revision: 2 });
        expect(cleared.answer.history.map((entry) => entry.text)).toEqual([
            "Keep this in history",
            "",
        ]);
        expect((await snapshot()).answers).toEqual([cleared.answer]);
    });

    test("the caller cannot name another author or bypass input validation", async () => {
        for (const input of [
            { ...answerInput(), userId: fixtures.editor.userId },
            { ...answerInput(), authorUserId: fixtures.editor.userId },
            {
                ...answerInput(),
                author: { kind: "account", userId: fixtures.editor.userId },
            },
            { ...answerInput(), text: "x".repeat(4001) },
            { ...answerInput(), mutationId: "not-a-uuid" },
            { ...answerInput(), expectedRevision: -1 },
        ])
            expect(
                (
                    await answerPost(
                        request(`${endpoint}/answers`, "POST", input),
                    )
                ).status,
            ).toBe(400);
        expect((await snapshot()).answers).toEqual([]);
    });

    test("unknown set/question IDs cannot create orphan answers", async () => {
        for (const input of [
            { ...answerInput(), setId: "missing" },
            { ...answerInput(), questionId: "missing" },
        ])
            expect((await writeAnswer(input)).status).toBe(404);
        expect((await snapshot()).answers).toEqual([]);
    });

    test("GET redacts a removed author's identity without exposing stored account details", async () => {
        const result = await saved(
            answerInput("Keep the decision"),
            asEditor(),
        );
        await UserModel.deleteOne({ _id: fixtures.editor._id });
        const view = await snapshot();
        expect(view.answers[0]).toMatchObject({
            id: result.answer.id,
            text: "Keep the decision",
            author: { kind: "removed" },
        });
        expect(view.answers[0].author).toEqual({ kind: "removed" });
        const serialized = JSON.stringify(view);
        expect(serialized).not.toContain(fixtures.editor.userId);
        expect(serialized).not.toContain(fixtures.editor.email);
        expect(serialized).not.toContain(fixtures.editor.unsubscribeToken);
    });

    test("author erasure waits for existing writes, then removes stored identity and retains history", async () => {
        const result = await saved(
            answerInput("Retained decision"),
            asEditor(),
        );
        const key = {
            domainId: String(fixtures.domain._id),
            userId: fixtures.editor.userId,
        };
        let signalEntered!: () => void;
        let releaseWrite!: () => void;
        const entered = new Promise<void>((resolve) => {
            signalEntered = resolve;
        });
        const held = new Promise<void>((resolve) => {
            releaseWrite = resolve;
        });
        const writing = withAccountWrite(
            { ...key, purpose: "meeting-erasure-test" },
            async () => {
                signalEntered();
                await held;
            },
        );
        try {
            await entered;
            await expect(
                redactMeetingQuestionAuthor(key.domainId, key.userId),
            ).rejects.toMatchObject({ code: "account_busy" });
            expect(
                (
                    await MeetingQuestionAnswerModel.findOne({
                        id: result.answer.id,
                    })
                )?.authorId,
            ).toBe(key.userId);
        } finally {
            releaseWrite();
            await writing;
        }
        await redactMeetingQuestionAuthor(key.domainId, key.userId);
        const stored = await MeetingQuestionAnswerModel.findOne({
            id: result.answer.id,
        }).lean();
        expect(stored?.authorId).toBeUndefined();
        expect(stored?.text).toBe(result.answer.text);
        expect(stored?.history).toEqual(result.answer.history);
        expect((await snapshot()).answers[0].author).toEqual({
            kind: "removed",
        });
        expect(
            (await writeAnswer(answerInput("Late save", 1), asEditor())).status,
        ).toBe(409);
    });
});

describe("route rate limits", () => {
    test("the 121st read is refused within one window", async () => {
        jest.spyOn(Date, "now").mockReturnValue(Date.now());
        const responses = await Promise.all(
            Array.from({ length: 121 }, () => GET(request())),
        );
        expect(
            responses.filter((response) => response.status === 200),
        ).toHaveLength(120);
        expect(
            responses.filter((response) => response.status === 429),
        ).toHaveLength(1);
    });

    test.each(["set", "answer"])(
        "the 61st %s write is refused within one window",
        async (kind) => {
            if (kind === "answer") await seed();
            jest.spyOn(Date, "now").mockReturnValue(Date.now());
            const input = answerInput();
            const responses: Response[] = [];
            for (let index = 0; index < 61; index++) {
                responses.push(
                    kind === "set"
                        ? await writeSet()
                        : await writeAnswer(input),
                );
            }
            expect(
                responses.filter((response) => response.status < 300),
            ).toHaveLength(60);
            expect(
                responses.filter((response) => response.status === 429),
            ).toHaveLength(1);
        },
    );
});

describe("observed native meeting seed boundaries", () => {
    test("the bio and nine image wells fit within sixteen candidate groups", async () => {
        const set = setInput();
        const group = set.questions[0].candidateGroups[0];
        set.questions[0].candidateGroups = Array.from(
            { length: 10 },
            (_, index) => ({ ...group, title: `Candidate group ${index + 1}` }),
        );
        expect((await writeSet(set)).status).toBe(200);
        set.questions[0].candidateGroups = Array.from(
            { length: 16 },
            (_, index) => ({ ...group, title: `Candidate group ${index + 1}` }),
        );
        expect((await writeSet(set, 1)).status).toBe(200);
        set.questions[0].candidateGroups.push(group);
        expect((await writeSet(set, 2)).status).toBe(400);
        expect(
            (await snapshot()).sets[0].questions[0].candidateGroups,
        ).toHaveLength(16);
    });

    test("the native leading-hyphen widget ID remains a literal attribute identity", async () => {
        const set = setInput();
        set.questions[0].locations[0].componentId = "-Zkk_c_EU8FAbdKKlyLW4";
        expect((await writeSet(set)).status).toBe(200);
        expect(
            (await snapshot()).sets[0].questions[0].locations[0].componentId,
        ).toBe("-Zkk_c_EU8FAbdKKlyLW4");
        for (const value of [
            "#-Zkk_c_EU8FAbdKKlyLW4",
            "widget > p",
            "[data-feedback-id=widget]",
            "",
            "a".repeat(201),
        ]) {
            set.questions[0].locations[0].componentId = value;
            expect((await writeSet(set, 1)).status).toBe(400);
        }
    });
});
