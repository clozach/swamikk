import type { WidgetInstance } from "@courselit/common-models";
import { sectionLabel } from "@/services/section-edits/labels";

const block = (
    name: string,
    settings: Record<string, unknown> = {},
): WidgetInstance => ({
    widgetId: "section",
    name,
    shared: false,
    deleteable: true,
    settings,
});
// Saved shape from evidence/2026-09-15-section-removal/homepage-before.json,
// kept here without a runtime dependency on the machine-local vault fixture.
const homebase = block("rich-text", {
    text: {
        type: "doc",
        content: [
            {
                type: "heading",
                attrs: { level: 2 },
                content: [{ type: "text", text: "Anahata, my home base" }],
            },
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: "Anahata Yoga Retreat sits in native forest above Golden Bay.",
                    },
                ],
            },
        ],
    },
});

test("labels the saved homepage rich-text block by its visible heading", () => {
    expect(sectionLabel(homebase)).toBe("Anahata, my home base");
});

test("uses the newsletter heading that renders when the saved heading is absent", () => {
    expect(
        sectionLabel(
            block("anahataNewsletter", {
                cssId: "stay-in-touch",
                background: { type: "color", backgroundColor: "#e2d6c1" },
            }),
        ),
    ).toBe("Stay in Touch");
});

test("joins formatted heading pieces and skips empty earlier headings", () => {
    expect(
        sectionLabel(
            block("rich-text", {
                heading: "Unused field",
                text: {
                    type: "doc",
                    content: [
                        { type: "heading", content: [] },
                        {
                            type: "blockquote",
                            content: [
                                {
                                    type: "heading",
                                    content: [
                                        {
                                            type: "text",
                                            text: " Yoga",
                                            marks: [{ type: "bold" }],
                                        },
                                        { type: "hardBreak" },
                                        { type: "text", text: "for life " },
                                    ],
                                },
                            ],
                        },
                        {
                            type: "heading",
                            content: [{ type: "text", text: "Later heading" }],
                        },
                    ],
                },
            }),
        ),
    ).toBe("Yoga for life");
});

test("an intentional empty heading uses the readable block name, not hidden default words", () => {
    expect(sectionLabel(block("anahataNewsletter", { heading: "  " }))).toBe(
        "Anahata Stay in Touch",
    );
    expect(sectionLabel(block("anahataHero", { heading: "" }))).toBe(
        "Anahata Hero",
    );
    expect(
        sectionLabel(
            block("rich-text", {
                heading: "Unused field",
                text: {
                    type: "doc",
                    content: [
                        {
                            type: "paragraph",
                            content: [{ type: "text", text: "Just body copy" }],
                        },
                    ],
                },
            }),
        ),
    ).toBe("Rich text");
});

test.each([
    ["anahataHero", "Yoga Solutions for Life"],
    ["anahataTour", "Take a tour of Anahata"],
    ["anahataPrivateSessions", "Work with Swami one to one"],
    ["anahataGatherings", "Appearances and events"],
    ["anahataPosts", "Writing and recipes"],
])("%s uses the heading its current renderer supplies", (name, expected) => {
    expect(sectionLabel(block(name))).toBe(expected);
});

test("saved heading overrides defaults, while null follows each renderer's semantics", () => {
    expect(
        sectionLabel(
            block("anahataNewsletter", { heading: "  New\n heading " }),
        ),
    ).toBe("New heading");
    expect(sectionLabel(block("anahataNewsletter", { heading: null }))).toBe(
        "Stay in Touch",
    );
    expect(sectionLabel(block("anahataHero", { heading: null }))).toBe(
        "Anahata Hero",
    );
});

test("unknown block names become readable words and labels remain bounded", () => {
    expect(sectionLabel(block("anahataSpecialOffers"))).toBe("Special Offers");
    expect(sectionLabel(block("event-card_grid"))).toBe("Event card grid");
    expect(
        Array.from(
            sectionLabel(block("custom", { heading: "✨".repeat(200) })),
        ),
    ).toHaveLength(160);
});
