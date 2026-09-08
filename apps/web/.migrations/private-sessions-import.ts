import snapshot from "./data/private-sessions-2026-09-07.json";
import type {
    TextEditorContent,
    WidgetInstance,
} from "@courselit/common-models";
import type { PageCreationInput } from "@/services/content-changes/page-creation-types";
import { fingerprint } from "@/services/content-changes/stable";

type Node = Record<string, unknown>;
const text = (value: string): Node => ({ type: "text", text: value });
const paragraph = (value: string): Node => ({
    type: "paragraph",
    content: [text(value)],
});
const heading = (value: string, level = 2): Node => ({
    type: "heading",
    attrs: { level },
    content: [text(value)],
});
const list = (values: string[]): Node => ({
    type: "bulletList",
    content: values.map((value) => ({
        type: "listItem",
        content: [paragraph(value)],
    })),
});
const link = (label: string, href: string): Node => ({
    type: "paragraph",
    content: [{ ...text(label), marks: [{ type: "link", attrs: { href } }] }],
});

/** Opens an editable email only; importing this module performs no I/O. */
export function privateSessionEnquiry() {
    const body = [
        "Hello, I would like to enquire about a private session with Swami Karma Karuna.",
        "",
        "Name:",
        "Preferred date and time:",
        "Time zone:",
        "Online or in person:",
        "60 or 90 minutes:",
        "Phone (optional):",
        "",
    ].join("\n");
    return `mailto:${snapshot.enquiryEmail}?subject=${encodeURIComponent("Private session enquiry")}&body=${encodeURIComponent(body)}`;
}

function body(withImages: boolean): TextEditorContent {
    const imageAt = (after: string): Node[] =>
        withImages
            ? snapshot.images
                  .filter((image) => image.after === after)
                  .map(({ src, alt }) => ({
                      type: "image",
                      attrs: { src, alt },
                  }))
            : [];
    return {
        type: "doc",
        content: [
            ...snapshot.introduction.map(paragraph),
            link("Enquire about a session", privateSessionEnquiry()),
            paragraph(
                "Opens your mail app. Add your preferred date, time and time zone; availability and arrangements are confirmed by email.",
            ),
            ...imageAt("introduction"),
            heading("A session may take the form of"),
            list(snapshot.sessionForms),
            heading("Personalized and Transformative Sessions"),
            ...snapshot.personalized.map(paragraph),
            heading("Practices may include", 3),
            list(snapshot.practices),
            heading("Therapeutic Benefits"),
            ...snapshot.benefitsIntroduction.map(paragraph),
            list(snapshot.benefits),
            heading("Pricing"),
            paragraph(
                "Online or in person. Prices are in New Zealand dollars (NZD), including GST.",
            ),
            ...snapshot.prices.flatMap((price) => [
                heading(`${price.minutes}-minute sessions`, 3),
                list([
                    `Single session: NZD${price.singleNzd}.`,
                    `Five-session package: NZD${price.fiveSessionNzd} total, including ${price.includedGuidedMp3s} guided practice MP3s.`,
                ]),
                link(`View the ${price.minutes}-minute price card`, price.card),
            ]),
            paragraph(
                "Prices copied from Anahata’s published Private Sessions page on 7 September 2026. Ask by email about availability and your preferred option.",
            ),
            link("Enquire about a session", privateSessionEnquiry()),
            heading("Cleansing Packages"),
            paragraph(
                "These sessions are available in person only. Email to ask for details or arrange a session.",
            ),
            heading("Hatha Yogic Detox", 3),
            ...snapshot.cleansing.map(paragraph),
            ...imageAt("cleansing"),
            heading("About Swami Karma Karuna"),
            ...imageAt("biography"),
            ...snapshot.biography.map(paragraph),
            link("Enquire about a session", privateSessionEnquiry()),
            link(
                "Original Private Sessions information at Anahata ↗",
                snapshot.sourceUrl,
            ),
        ],
    };
}

/** Submit to the existing content-change API, then review its exact returned preview. */
export function privateSessionsCreation(): PageCreationInput {
    return {
        target: { kind: "page-create", pageId: snapshot.pageId },
        patch: {
            kind: "page-create",
            title: snapshot.title,
            content: body(false),
            intent: "Create a complete hidden Private Sessions page with the approved source copy, selectable prices, local resource links and an email enquiry. Local images will be added through the native editor before a separate reviewed publication.",
            materials: `${snapshot.sourceUrl}\nReviewed ${snapshot.sourceReviewedOn}. The local asset provenance is /anahata/private-sessions/provenance.json. No availability, booking or payment is promised.`,
        },
        summary: "Create the self-contained Private Sessions draft",
    };
}

function requireBaseline(value: unknown, expectedHash: string) {
    if (
        !/^[a-f0-9]{64}$/.test(expectedHash) ||
        fingerprint(value) !== expectedHash
    )
        throw new Error(
            "The reviewed native layout changed. Capture and review it again.",
        );
}

function nativeSharedReferences(
    layout: WidgetInstance[],
    sharedWidgets: Record<string, WidgetInstance>,
) {
    return layout.map((widget) => {
        if (!widget.shared) return widget;
        const shared = sharedWidgets[widget.name];
        if (!shared || shared.name !== widget.name || !shared.shared)
            throw new Error("The reviewed published site chrome is missing.");
        // Native updatePage merges these records into the site's shared draft.
        // Use the exact reviewed canonical record so that merge is a no-op.
        return structuredClone(shared);
    });
}

/** Only a matching text-only creation may receive the source-backed image nodes. */
export function privateSessionsImageDraft(
    layout: WidgetInstance[],
    sharedWidgets: Record<string, WidgetInstance>,
    expectedHash: string,
): WidgetInstance[] {
    requireBaseline({ layout, sharedWidgets }, expectedHash);
    const contentWidgets = layout.filter((widget) => !widget.shared);
    const expectedText = {
        type: "doc",
        content: [heading(snapshot.title, 1), ...body(false).content],
    };
    if (
        contentWidgets.length !== 1 ||
        contentWidgets[0].name !== "rich-text" ||
        fingerprint(contentWidgets[0].settings?.text) !==
            fingerprint(expectedText)
    )
        throw new Error(
            "The Private Sessions text draft no longer matches its reviewed creation.",
        );
    return nativeSharedReferences(
        layout.map((widget) =>
            widget !== contentWidgets[0]
                ? structuredClone(widget)
                : {
                      ...structuredClone(widget),
                      settings: {
                          ...widget.settings,
                          alignment: "left",
                          maxWidth: "max-w-4xl",
                          verticalPadding: "py-8",
                          text: {
                              type: "doc",
                              content: [
                                  heading(snapshot.title, 1),
                                  ...body(true).content,
                              ],
                          },
                      },
                  },
        ),
        sharedWidgets,
    );
}

/** Exactly three already-reviewed homepage fields; shared chrome is retained verbatim. */
export function privateSessionsHomeDraft(
    layout: WidgetInstance[],
    sharedWidgets: Record<string, WidgetInstance>,
    expectedHash: string,
): WidgetInstance[] {
    requireBaseline({ layout, sharedWidgets }, expectedHash);
    const next = structuredClone(layout);
    const one = (id: string, name: string) => {
        const widgets = next.filter(
            (widget) => widget.widgetId === id && widget.name === name,
        );
        if (widgets.length !== 1)
            throw new Error(
                "The reviewed homepage block is missing or ambiguous.",
            );
        return widgets[0];
    };
    const sessions = one(
        "ayr-anahataPrivateSessions",
        "anahataPrivateSessions",
    );
    if (sessions.settings?.buttonAction !== snapshot.sourceUrl)
        throw new Error("The Private Sessions homepage link changed.");
    sessions.settings = {
        ...sessions.settings,
        buttonAction: "/p/private-sessions",
    };
    const posts = one("ayr-anahataPosts", "anahataPosts");
    const items = posts.settings?.posts as
        | Array<{ id: string; thumbnail?: { url?: string } }>
        | undefined;
    if (
        !items ||
        items[0]?.id !== "anahata-post-kumara-salad" ||
        items[0].thumbnail?.url !==
            "https://www.anahata-retreat.org.nz/wp-content/uploads/2026/04/images-4.jpg"
    )
        throw new Error("The reviewed blog thumbnail changed.");
    items[0].thumbnail.url = "/anahata/post-roasted-vegetable-salad.jpg";
    const tour = one("ayr-anahataTour", "anahataTour");
    if (tour.settings && Object.keys(tour.settings).length)
        throw new Error(
            "The tour now has edited settings. Review them separately.",
        );
    tour.name = "rich-text";
    tour.settings = {
        alignment: "left",
        maxWidth: "max-w-4xl",
        verticalPadding: "py-8",
        text: {
            type: "doc",
            content: [
                heading("Take a tour of Anahata"),
                {
                    type: "image",
                    attrs: {
                        src: "/anahata/hp-hero-bg.jpg",
                        alt: "Sunrise and prayer flags at Anahata Yoga Retreat",
                    },
                },
                paragraph(
                    "A view from Anahata Yoga Retreat. Explore the retreat in the interactive tour on Anahata’s separate website.",
                ),
                link(
                    "Open Anahata’s virtual tour ↗",
                    "https://tour.anahata-retreat.org.nz/index.htm",
                ),
            ],
        },
    };
    return nativeSharedReferences(next, sharedWidgets);
}

export { fingerprint as privateSessionsFingerprint };
