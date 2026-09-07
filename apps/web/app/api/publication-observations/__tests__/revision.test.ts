import { releaseSettingsSignature } from "../../../../../../packages/common-logic/src/course-release-revision";

const course = {
    published: true,
    groups: [
        {
            _id: "one",
            rank: 1000,
            name: "Practice",
            lessonsOrder: ["old"],
            drip: {
                status: false,
                type: "relative-date",
                delayInMillis: 1000,
                email: { published: false, content: "Old message" },
            },
        },
        {
            _id: "two",
            rank: 2000,
            drip: {
                status: true,
                type: "relative-date",
                delayInMillis: 2000,
                dateInUTC: 9000,
            },
        },
    ],
};

describe("release revision scope", () => {
    it("preserves evidence through content, message, and inactive schedule edits", () => {
        const changed = structuredClone(course);
        changed.groups[0].name = "Renamed";
        changed.groups[0].rank = 1500;
        changed.groups[0].lessonsOrder = ["old", "new-drop"];
        changed.groups[0].drip.delayInMillis = 3000;
        changed.groups[1].drip.dateInUTC = 10000;
        changed.groups[0].drip.email = {
            published: true,
            content: "New message",
        };
        expect(releaseSettingsSignature(changed)).toBe(
            releaseSettingsSignature(course),
        );
    });
    it.each(["publication", "available", "delay", "order", "remove"])(
        "invalidates availability context after a %s change",
        (field) => {
            const changed = structuredClone(course);
            if (field === "publication") changed.published = false;
            if (field === "available") changed.groups[0].drip.status = true;
            if (field === "delay") changed.groups[1].drip.delayInMillis = 3000;
            if (field === "order") changed.groups[0].rank = 3000;
            if (field === "remove") changed.groups.pop();
            expect(releaseSettingsSignature(changed)).not.toBe(
                releaseSettingsSignature(course),
            );
        },
    );
});
