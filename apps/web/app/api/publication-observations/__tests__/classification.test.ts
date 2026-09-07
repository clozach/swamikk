import { classifyObservedRelease } from "../../../../../../packages/common-logic/src/member-access/observations";

const at = (time: number) => new Date(time);
const observation = {
    publishedBy: at(1000),
    witness: {
        observedAt: at(2000),
        groupId: "one",
        releaseRevision: 3,
        availability: "available" as const,
        actorUserId: "admin",
        observationId: "witness",
    },
};
const context = {
    observation,
    groupId: "one",
    releaseRevision: 3,
    availableNow: true,
    start: at(3000),
    cutoff: at(9000),
};

describe("publication upper-bound evidence at retention boundaries", () => {
    it("classifies only a strictly pre-start matching availability witness as archive", () => {
        expect(classifyObservedRelease(context)).toBe("archive");
        expect(classifyObservedRelease({ ...context, start: at(2000) })).toBe(
            "unknown",
        );
        expect(classifyObservedRelease({ ...context, groupId: "other" })).toBe(
            "unknown",
        );
        expect(
            classifyObservedRelease({ ...context, releaseRevision: 4 }),
        ).toBe("unknown");
        expect(
            classifyObservedRelease({ ...context, availableNow: false }),
        ).toBe("unknown");
    });
    it("requires actual release evidence to retain and honors start/cutoff boundaries", () => {
        expect(
            classifyObservedRelease({
                ...context,
                start: at(500),
                releasedAt: at(3000),
            }),
        ).toBe("retained");
        expect(
            classifyObservedRelease({
                ...context,
                releasedAt: at(3000),
                releaseRevision: 4,
            }),
        ).toBe("retained");
        expect(
            classifyObservedRelease({
                ...context,
                availableNow: false,
                releasedAt: at(9000),
            }),
        ).toBe("unknown");
        expect(
            classifyObservedRelease({
                ...context,
                availableNow: false,
                releasedAt: at(2500),
            }),
        ).toBe("archive");
    });
    it("does not backdate publication from an observation after the relevant release", () => {
        expect(
            classifyObservedRelease({
                ...context,
                observation: { ...observation, publishedBy: at(5000) },
                availableNow: false,
                releasedAt: at(4000),
            }),
        ).toBe("unknown");
        expect(
            classifyObservedRelease({
                ...context,
                observation: {
                    ...observation,
                    publishedBy: at(10000),
                    witness: { ...observation.witness, observedAt: at(10000) },
                },
            }),
        ).toBe("unknown");
    });
    it("keeps missing evidence and an unrecorded membership start unknown", () => {
        expect(
            classifyObservedRelease({ ...context, observation: undefined }),
        ).toBe("unknown");
        expect(
            classifyObservedRelease({
                ...context,
                start: undefined,
                releasedAt: at(4000),
            }),
        ).toBe("unknown");
        expect(
            classifyObservedRelease({
                ...context,
                observation: {
                    ...observation,
                    publishedBy: new Date("invalid"),
                },
            }),
        ).toBe("unknown");
    });
});
