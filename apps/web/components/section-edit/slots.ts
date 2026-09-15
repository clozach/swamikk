/** Portal anchors are ours; rendered sections remain owned by the page's React tree. */
export interface SectionPosition {
    beforeId: string | null;
    afterId: string | null;
    index: number;
}
export interface SectionSlotInput {
    widgetId: string;
    removed: boolean;
    position: SectionPosition;
}
export interface SectionSlot {
    widgetId: string;
    host: HTMLElement;
}

/** Earlier removals can share an index; saved sibling identities retain their order. */
export function orderSectionSlots(items: SectionSlotInput[]) {
    const remaining = [...items].sort(
        (a, b) => a.position.index - b.position.index,
    );
    const ids = new Set(remaining.map((item) => item.widgetId));
    const predecessors = new Map(
        remaining.map((item) => [item.widgetId, new Set<string>()]),
    );
    for (const item of remaining) {
        if (item.position.beforeId && ids.has(item.position.beforeId))
            predecessors.get(item.widgetId)!.add(item.position.beforeId);
        if (item.position.afterId && ids.has(item.position.afterId))
            predecessors.get(item.position.afterId)!.add(item.widgetId);
    }
    const ordered: SectionSlotInput[] = [];
    while (remaining.length) {
        const index = remaining.findIndex(
            (item) => predecessors.get(item.widgetId)!.size === 0,
        );
        // Concurrent reordering can conflict with an old anchor; the server decides restoration.
        const [next] = remaining.splice(index < 0 ? 0 : index, 1);
        ordered.push(next);
        for (const group of Array.from(predecessors.values()))
            group.delete(next.widgetId);
    }
    return ordered;
}

export function createSectionSlots(pageId: string) {
    const hosts = new Map<string, HTMLElement>();
    const hidden = new Set<HTMLElement>();
    let lastParent: HTMLElement | null = null;

    const sync = (items: SectionSlotInput[]): SectionSlot[] => {
        const root = Array.from(
            document.querySelectorAll<HTMLElement>("[data-feedback-page]"),
        ).find((item) => item.dataset.feedbackPage === pageId);
        if (!root) return [];
        const nodes = Array.from(
            root.querySelectorAll<HTMLElement>("[data-feedback-widget]"),
        );
        const byId = new Map(
            nodes.map((node) => [node.dataset.feedbackWidget!, node]),
        );
        const wanted = new Map(items.map((item) => [item.widgetId, item]));
        for (const [id, host] of Array.from(hosts)) {
            if (!wanted.has(id)) {
                host.remove();
                hosts.delete(id);
            }
        }
        for (const node of Array.from(hidden)) {
            if (
                !wanted.get(node.dataset.feedbackWidget!)?.removed ||
                !node.isConnected
            ) {
                node.removeAttribute("data-kk-section-removed");
                hidden.delete(node);
            }
        }
        for (const item of items) {
            if (!hosts.has(item.widgetId)) {
                const host = document.createElement("div");
                host.dataset.feedbackUi = "";
                host.dataset.kkSectionSlot = item.widgetId;
                hosts.set(item.widgetId, host);
            }
        }
        const sorted = orderSectionSlots(items);
        const followingByParent = new Map<HTMLElement, HTMLElement>();
        for (const item of [...sorted].reverse()) {
            const node = byId.get(item.widgetId);
            const next = item.position.afterId
                ? byId.get(item.position.afterId)
                : null;
            const previous = item.position.beforeId
                ? byId.get(item.position.beforeId)
                : null;
            // Template's body remains after its last authored section disappears.
            const parent =
                node?.parentElement ||
                next?.parentElement ||
                previous?.parentElement ||
                (lastParent?.isConnected ? lastParent : null) ||
                root.querySelector<HTMLElement>(":scope > .min-h-screen") ||
                root;
            lastParent = parent;
            const host = hosts.get(item.widgetId)!;
            const className = item.removed
                ? "kk-section-slot kk-section-slot-removed"
                : "kk-section-slot";
            if (host.className !== className) host.className = className;
            if (item.removed && node) {
                if (!node.hasAttribute("data-kk-section-removed"))
                    node.setAttribute("data-kk-section-removed", "");
                hidden.add(node);
            }
            const afterHost = item.position.afterId
                ? hosts.get(item.position.afterId)
                : null;
            const previousNext =
                previous?.nextSibling === host
                    ? host.nextSibling
                    : previous?.nextSibling;
            const reference =
                node ||
                followingByParent.get(parent) ||
                (afterHost?.parentElement === parent ? afterHost : null) ||
                next ||
                previousNext ||
                null;
            if (
                reference !== host &&
                (host.parentElement !== parent ||
                    host.nextSibling !== reference)
            ) {
                parent.insertBefore(host, reference);
            }
            followingByParent.set(parent, host);
        }
        return sorted.flatMap(({ widgetId }) => {
            const host = hosts.get(widgetId);
            return host?.isConnected ? [{ widgetId, host }] : [];
        });
    };

    const dispose = () => {
        for (const host of Array.from(hosts.values())) host.remove();
        for (const node of Array.from(hidden))
            node.removeAttribute("data-kk-section-removed");
        hosts.clear();
        hidden.clear();
    };
    return { sync, dispose };
}
