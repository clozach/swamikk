import type { PageTextLeaves } from "@courselit/common-models";
import {
    applyChangesToIndex,
    currentAt,
    humanizePath,
    indexLeaves,
    nodePlain,
    normalizeText,
} from "../leaves";
import {
    domToNode,
    findRuns,
    markRuns,
    orderedRuns,
    unmarkRuns,
    visibleText,
    AMBIGUOUS_ATTR,
    RUN_ATTR,
} from "../runs";

const link = { type: "link", attrs: { href: "/p/more", target: "_blank" } };
const paragraph1 = {
    type: "paragraph",
    content: [{ type: "text", text: "Hello there" }],
};
const paragraph2 = {
    type: "paragraph",
    content: [
        { type: "text", text: "Read " },
        { type: "text", text: "more ↗", marks: [link] },
    ],
};
const item = {
    type: "paragraph",
    content: [
        { type: "text", text: "Item " },
        { type: "text", text: "one", marks: [{ type: "bold" }] },
    ],
};
const linkOnly = {
    type: "paragraph",
    content: [{ type: "text", text: "Read on ↗", marks: [link] }],
};
const both = {
    type: "paragraph",
    content: [
        {
            type: "text",
            text: "Both",
            marks: [{ type: "bold" }, { type: "italic" }],
        },
    ],
};
const broken = {
    type: "paragraph",
    content: [
        { type: "text", text: "Line one" },
        { type: "hardBreak" },
        { type: "text", text: "Line two" },
    ],
};
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
                    value: "Swami works at Anahata Yoga Retreat in Golden Bay",
                    kind: "text",
                    source: "default",
                },
                {
                    path: "paragraphs.0.linkText",
                    value: "Anahata Yoga Retreat",
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
            widgetId: "intro",
            name: "rich-text",
            shared: false,
            leaves: [
                {
                    path: "text.content.0",
                    value: "Hello there",
                    kind: "rich-text-node",
                    source: "settings",
                    node: paragraph1,
                },
                {
                    path: "text.content.0.content.0.text",
                    value: "Hello there",
                    kind: "rich-text-leaf",
                    source: "settings",
                },
                {
                    path: "text.content.1",
                    value: "Read more ↗",
                    kind: "rich-text-node",
                    source: "settings",
                    node: paragraph2,
                },
                {
                    path: "text.content.1.content.0.text",
                    value: "Read ",
                    kind: "rich-text-leaf",
                    source: "settings",
                },
                {
                    path: "text.content.1.content.1.text",
                    value: "more ↗",
                    kind: "rich-text-leaf",
                    source: "settings",
                },
                {
                    path: "text.content.2.content.0.content.0",
                    value: "Item one",
                    kind: "rich-text-node",
                    source: "settings",
                    node: item,
                },
                {
                    path: "text.content.2.content.0.content.0.content.0.text",
                    value: "Item ",
                    kind: "rich-text-leaf",
                    source: "settings",
                },
                {
                    path: "text.content.2.content.0.content.0.content.1.text",
                    value: "one",
                    kind: "rich-text-leaf",
                    source: "settings",
                },
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
                {
                    path: "menu.1.label",
                    value: "Anahata events ↗",
                    kind: "text",
                    source: "default",
                },
            ],
        },
    ],
};
// Entries added at runtime so the fixture above stays readable.
page.widgets[0].leaves.push(
    {
        path: "paragraphs.1.text",
        value: "See the retreat today",
        kind: "text",
        source: "default",
    },
    {
        path: "paragraphs.1.linkText",
        value: "the retreat",
        kind: "text",
        source: "default",
    },
);
page.widgets[1].leaves.push(
    {
        path: "text.content.3",
        value: "Read on ↗",
        kind: "rich-text-node",
        source: "settings",
        node: linkOnly,
    },
    {
        path: "text.content.3.content.0.text",
        value: "Read on ↗",
        kind: "rich-text-leaf",
        source: "settings",
    },
    {
        path: "text.content.4",
        value: "Both",
        kind: "rich-text-node",
        source: "settings",
        node: both,
    },
    {
        path: "text.content.4.content.0.text",
        value: "Both",
        kind: "rich-text-leaf",
        source: "settings",
    },
    {
        path: "text.content.5",
        value: "Line one\nLine two",
        kind: "rich-text-node",
        source: "settings",
        node: broken,
    },
    {
        path: "text.content.5.content.0.text",
        value: "Line one",
        kind: "rich-text-leaf",
        source: "settings",
    },
    {
        path: "text.content.5.content.2.text",
        value: "Line two",
        kind: "rich-text-leaf",
        source: "settings",
    },
);
const copy = {
    runLabel: "Editable text. Press Enter to edit.",
    runHint: "Click to edit",
    richHint: "Click to edit; links stay",
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
          <nav><a href="/p/members">Membership</a><a id="ext" href="https://x.org">Anahata events<sup aria-hidden="true">↗</sup><span class="sr-only"> (opens in a new tab)</span></a></nav>
          <div hidden><a href="/p/members">Membership</a></div>
        </div>
        <div data-feedback-id="hero" data-feedback-widget="hero">
          <h1>Welcome&nbsp;home</h1>
          <p id="linked">Swami works at <a href="/anahata">Anahata Yoga Retreat</a> in Golden Bay</p>
          <p id="linked-ext">See <a href="https://x.org">the retreat<sup aria-hidden="true">↗</sup><span class="sr-only"> (opens in a new tab)</span></a> today</p>
          <span>Dup</span><span>Dup</span>
          <em>Twice</em>
          <button type="button">Not a leaf</button>
        </div>
        <div data-feedback-id="intro" data-feedback-widget="intro">
          <div class="tiptap">
            <p id="p1">Hello there</p>
            <p id="p2">Read <span class="link"><a href="/p/more" target="_blank" rel="noopener">more<sup>↗</sup></a></span></p>
            <ul><li id="li"><p id="p3">Item <strong>one</strong></p></li></ul>
            <p id="p4"><span class="link"><a href="/p/more" target="_blank">Read on<sup>↗</sup></a></span></p>
            <p id="p5"><em><strong>Both</strong></em></p>
            <p id="p6">Line one<br>Line two</p>
          </div>
        </div>
      </div>`;
});

const byId = (id: string) => document.getElementById(id) as HTMLElement;

test("matches plain, linked-text and rich-node runs; inner parts and outer duplicates are not separate runs", () => {
    const index = indexLeaves(page);
    const { runs, ambiguous } = findRuns(document.body, index);
    const summary = runs.map((run) => [
        run.element.id || run.element.tagName,
        run.kind,
        run.path,
    ]);
    expect(summary).toEqual(
        expect.arrayContaining([
            ["H1", "text", "heading"],
            ["linked", "linked-text", "paragraphs.0.text"],
            ["p1", "text", "text.content.0.content.0.text"],
            ["p2", "rich-node", "text.content.1"],
            ["p3", "rich-node", "text.content.2.content.0.content.0"],
            ["linked-ext", "linked-text", "paragraphs.1.text"],
            ["p4", "rich-node", "text.content.3"],
            ["p5", "rich-node", "text.content.4"],
            ["p6", "rich-node", "text.content.5"],
            ["A", "text", "menu.0.label"],
            ["ext", "text", "menu.1.label"],
        ]),
    );
    expect(normalizeText(visibleText(byId("ext")))).toBe("Anahata events ↗");
    expect(runs.find((run) => run.kind === "linked-text")?.linkPath).toBe(
        "paragraphs.0.linkText",
    );
    // The link inside the hero paragraph, the bold word inside the list item, and the list item around its paragraph are not runs of their own.
    expect(
        summary.some(
            ([id, , path]) => id === "A" && path === "paragraphs.0.linkText",
        ),
    ).toBe(false);
    expect(summary.some(([, , path]) => path.endsWith("content.1.text"))).toBe(
        false,
    );
    expect(summary.some(([id]) => id === "li")).toBe(false);
    // A link-only or doubly-marked paragraph is one run on the <p>, never on its inner wrapper.
    expect(
        summary.filter(([, , path]) => path === "text.content.3"),
    ).toHaveLength(1);
    expect(
        summary.filter(([, , path]) => path === "text.content.4"),
    ).toHaveLength(1);
    expect(runs.filter((run) => run.path === "kicker")).toHaveLength(2);
    expect(ambiguous.map((element) => element.tagName)).toEqual(["EM"]);
    markRuns({ runs, ambiguous }, copy);
    expect(byId("linked").getAttribute(RUN_ATTR)).toBe("paragraphs.0.text");
    expect(byId("linked").getAttribute("data-kk-kind")).toBe("linked-text");
    expect(byId("p2").getAttribute("title")).toBe("Click to edit; links stay");
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

test("visible text reads a paragraph the way the store does, and the DOM writes back as the stored node shape", () => {
    expect(normalizeText(visibleText(byId("p2")))).toBe("Read more ↗");
    // Edit the words around the link, add a bold word and a line break.
    const p2 = byId("p2");
    p2.firstChild!.nodeValue = "Read even ";
    p2.insertAdjacentHTML("beforeend", " <strong>today</strong><br>");
    expect(domToNode(p2, paragraph2)).toEqual({
        type: "paragraph",
        content: [
            { type: "text", text: "Read even " },
            { type: "text", text: "more ↗", marks: [link] },
            { type: "text", text: " " },
            { type: "text", text: "today", marks: [{ type: "bold" }] },
        ],
    });
    const p3 = byId("p3");
    p3.querySelector("strong")!.textContent = "one";
    expect(domToNode(p3, item)).toEqual(item);
    expect(nodePlain(item)).toBe("Item one");
    // Marks come back in the stored order, so an untouched paragraph is no change.
    expect(domToNode(byId("p5"), both)).toEqual(both);
    expect(domToNode(byId("p4"), linkOnly)).toEqual(linkOnly);
    expect(domToNode(byId("p6"), broken)).toEqual(broken);
});

test("a saved change moves the index: a string leaf, and a node with the leaves beneath it", () => {
    const index = indexLeaves(page);
    applyChangesToIndex(index, "hero", [
        {
            kind: "text",
            path: "heading",
            before: "Welcome  home",
            after: "Welcome back",
        },
    ]);
    const hero = index.get("hero")!;
    expect(hero.byValue.has(normalizeText("Welcome  home"))).toBe(false);
    expect(hero.byValue.get("Welcome back")).toEqual(["heading"]);
    const after = {
        type: "paragraph",
        content: [{ type: "text", text: "Read all of it" }],
    };
    applyChangesToIndex(index, "intro", [
        { kind: "node", path: "text.content.1", before: paragraph2, after },
    ]);
    const intro = index.get("intro")!;
    expect(intro.byNodeValue.get("Read all of it")).toEqual(["text.content.1"]);
    expect(intro.byNodeValue.has("Read more ↗")).toBe(false);
    expect(intro.byPath.get("text.content.1.content.0.text")?.value).toBe(
        "Read all of it",
    );
    expect(intro.byPath.has("text.content.1.content.1.text")).toBe(false);
    expect(
        currentAt(
            index,
            { kind: "page-widget-text", pageId: "home", widgetId: "intro" },
            "text.content.1",
        ),
    ).toEqual(after);
    expect(
        currentAt(
            index,
            { kind: "page-widget-text", pageId: "home", widgetId: "hero" },
            "heading",
        ),
    ).toBe("Welcome back");
    expect(normalizeText(" a b   c ")).toBe("a b c");
    expect(humanizePath("text.content.0.content.1.text")).toBe(
        "text › 1 › 2 › text",
    );
    expect(humanizePath("columns.2.addressLines.0")).toBe(
        "columns › 3 › address lines › 1",
    );
});
