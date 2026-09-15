import { createSectionSlots } from "../slots";

const section = (
    id: string,
    index: number,
    removed = false,
    beforeId: string | null = null,
    afterId: string | null = null,
) => ({ widgetId: id, removed, position: { index, beforeId, afterId } });
const html = `<div data-feedback-page="home"><div class="min-h-screen"><div data-feedback-widget="a">A</div><div data-feedback-widget="b">B</div><div data-feedback-widget="c">C</div></div></div>`;
const order = () =>
    Array.from(document.querySelector(".min-h-screen")!.children).map(
        (node) =>
            (node as HTMLElement).dataset.kkSectionSlot ||
            (node as HTMLElement).dataset.feedbackWidget,
    );

beforeEach(() => {
    document.body.innerHTML = html;
});

test("removal hides but does not detach React-owned sections; cleanup returns the same nodes", () => {
    const a = document.querySelector<HTMLElement>(
        '[data-feedback-widget="a"]',
    )!;
    const slots = createSectionSlots("home");
    slots.sync([section("a", 0, true, null, "b"), section("b", 1)]);
    expect(a.isConnected).toBe(true);
    expect(a.hasAttribute("data-kk-section-removed")).toBe(true);
    expect(order()).toEqual(["a", "a", "b", "b", "c"]);
    slots.dispose();
    expect(document.querySelector('[data-feedback-widget="a"]')).toBe(a);
    expect(a.hasAttribute("data-kk-section-removed")).toBe(false);
    expect(document.querySelectorAll("[data-kk-section-slot]")).toHaveLength(0);
});

test("removed slots retain order after React removes siblings and sync is idempotent", () => {
    const slots = createSectionSlots("home");
    const items = [
        section("a", 0, true, null, "b"),
        section("b", 0, true, null, "c"),
        section("c", 0),
    ];
    slots.sync(items);
    document.querySelector('[data-feedback-widget="a"]')!.remove();
    document.querySelector('[data-feedback-widget="b"]')!.remove();
    slots.sync(items);
    expect(order()).toEqual(["a", "b", "c", "c"]);
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });
    slots.sync(items);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
    slots.dispose();
});

test("after reload, removed sections remain in body when all authored sections are absent", () => {
    document.body.innerHTML =
        '<div data-feedback-page="home"><header>Header</header><div class="min-h-screen"></div><footer>Footer</footer></div>';
    const slots = createSectionSlots("home");
    slots.sync([section("a", 1, true, null, "b"), section("b", 1, true)]);
    expect(order()).toEqual(["a", "b"]);
    slots.dispose();
});

test("a replaced page tree gets fresh anchors and no stale hidden nodes", () => {
    const slots = createSectionSlots("home");
    const items = [section("a", 0, true, null, "b"), section("b", 1)];
    const old = document.querySelector<HTMLElement>(
        '[data-feedback-widget="a"]',
    )!;
    const first = slots.sync(items)[0].host;
    document.body.innerHTML = html;
    const next = slots.sync(items)[0].host;
    expect(next).toBe(first);
    expect(next.isConnected).toBe(true);
    expect(old.hasAttribute("data-kk-section-removed")).toBe(false);
    expect(
        document.querySelector('[data-feedback-widget="a"]'),
    ).toHaveAttribute("data-kk-section-removed");
    slots.dispose();
});

test("saved sibling identities order several removals even when their original indices repeat", () => {
    document.body.innerHTML =
        '<div data-feedback-page="home"><div class="min-h-screen"></div></div>';
    const slots = createSectionSlots("home");
    const items = [
        section("c", 0, true),
        section("a", 0, true, null, "c"),
        section("b", 1, true, "a", "c"),
    ];
    slots.sync(items);
    expect(order()).toEqual(["a", "b", "c"]);
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });
    slots.sync(items);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
    slots.dispose();
});
