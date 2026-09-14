import type { PageTextLeaves } from "@courselit/common-models";
import {
    indexLeaves,
    normalizeText,
    updateLeaf,
    humanizePath,
} from "../leaves";
import {
    findRuns,
    markRuns,
    unmarkRuns,
    orderedRuns,
    RUN_ATTR,
    AMBIGUOUS_ATTR,
} from "../runs";

const page: PageTextLeaves = {
    pageId: "home",
    revision: 3,
    widgets: [
        {
            widgetId: "hero",
            name: "anahataHero",
            shared: false,
            leaves: [
                {
                    path: "heading",
                    value: "Welcome  home",
                    kind: "text",
                    source: "default",
                },
                {
                    path: "paragraphs.0.text",
                    value: "Read more",
                    kind: "text",
                    source: "default",
                },
                {
                    path: "kicker",
                    value: "Dup",
                    kind: "text",
                    source: "settings",
                },
                { path: "a", value: "Twice", kind: "text", source: "settings" },
                { path: "b", value: "Twice", kind: "text", source: "settings" },
            ],
        },
        {
            widgetId: "header",
            name: "anahataHeader",
            shared: true,
            leaves: [
                {
                    path: "menu.0.label",
                    value: "Membership",
                    kind: "text",
                    source: "default",
                },
            ],
        },
    ],
};
const copy = {
    runLabel: "Editable text. Press Enter to edit.",
    runHint: "Click to edit",
    sharedHint: "Site-wide text",
    ambiguous: "Ambiguous",
};

beforeAll(() => {
    // jsdom lays nothing out; every element counts as visible here.
    Element.prototype.getClientRects = function () {
        return [{}] as unknown as DOMRectList;
    };
});
beforeEach(() => {
    document.body.innerHTML = `
      <div data-feedback-page="home">
        <div data-feedback-id="header">
          <nav><a href="/p/members">Membership</a></nav>
          <div hidden><a href="/p/members">Membership</a></div>
        </div>
        <div data-feedback-id="hero" data-feedback-widget="hero">
          <h1>Welcome&nbsp;home</h1>
          <p>Read <a href="/more">more</a></p>
          <span>Dup</span><span>Dup</span>
          <em>Twice</em>
          <button type="button">Not a leaf</button>
        </div>
      </div>`;
});

test("matches rendered runs to unique leaves, marks ambiguous values, skips mixed content", () => {
    const index = indexLeaves(page);
    const { runs, ambiguous } = findRuns(document.body, index);
    const summary = runs.map((run) => [
        run.element.tagName,
        run.path,
        run.shared,
    ]);
    expect(summary).toEqual(
        expect.arrayContaining([
            ["H1", "heading", false],
            ["SPAN", "kicker", false],
            ["A", "menu.0.label", true],
        ]),
    );
    expect(runs.filter((run) => run.path === "kicker")).toHaveLength(2);
    expect(runs.filter((run) => run.path === "menu.0.label")).toHaveLength(2);
    expect(summary.some(([, path]) => path === "paragraphs.0.text")).toBe(
        false,
    );
    expect(ambiguous.map((element) => element.tagName)).toEqual(["EM"]);
    markRuns({ runs, ambiguous }, copy);
    const h1 = document.querySelector("h1")!;
    expect(h1.getAttribute(RUN_ATTR)).toBe("heading");
    expect(h1.getAttribute("tabindex")).toBe("0");
    expect(document.querySelector("nav a")!.getAttribute("title")).toContain(
        "Site-wide text",
    );
    expect(document.querySelector("em")!.hasAttribute(AMBIGUOUS_ATTR)).toBe(
        true,
    );
    expect(orderedRuns(runs)[0].element.tagName).toBe("A");
    unmarkRuns(document.body);
    expect(
        document.querySelectorAll(
            `[${RUN_ATTR}], [${AMBIGUOUS_ATTR}], [tabindex]`,
        ),
    ).toHaveLength(0);
});

test("a saved value moves the leaf so later matches and duplicates follow it", () => {
    const index = indexLeaves(page);
    updateLeaf(index, "hero", "heading", "Welcome back");
    const hero = index.get("hero")!;
    expect(hero.byValue.has(normalizeText("Welcome  home"))).toBe(false);
    expect(hero.byValue.get("Welcome back")).toEqual(["heading"]);
    expect(hero.byPath.get("heading")).toMatchObject({
        value: "Welcome back",
        source: "settings",
    });
    expect(normalizeText(" a b   c ")).toBe("a b c");
    expect(humanizePath("text.content.0.content.1.text")).toBe(
        "text › 1 › 2 › text",
    );
    expect(humanizePath("columns.2.addressLines.0")).toBe(
        "columns › 3 › address lines › 1",
    );
});
