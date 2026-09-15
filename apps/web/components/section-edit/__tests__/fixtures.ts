import type { PageSections, SectionEdit } from "@courselit/common-models";

export const page: PageSections = {
    pageId: "home",
    documentId: "doc-home",
    revision: 1,
    sections: [
        {
            widgetId: "hero",
            widgetName: "anahataHero",
            label: "Welcome",
            fingerprint: "hero-version",
            index: 1,
        },
        {
            widgetId: "body",
            widgetName: "anahataText",
            label: "Our story",
            fingerprint: "body-version",
            index: 2,
        },
    ],
    removed: [],
};
export const removal: SectionEdit = {
    editId: "removed-hero",
    target: { pageId: "home", documentId: "doc-home", widgetId: "hero" },
    action: "remove",
    widgetName: "anahataHero",
    label: "Welcome",
    widget: {
        widgetId: "hero",
        name: "anahataHero",
        shared: false,
        deleteable: true,
        settings: { heading: "Welcome", image: { mediaId: "photo" } },
    },
    position: { beforeId: null, afterId: "body", index: 1 },
    userId: "admin",
    at: "2026-09-15T09:00:00Z",
    revision: 2,
};
export const removedPage: PageSections = {
    ...page,
    sections: [page.sections[1]],
    removed: [removal],
    revision: 2,
};
