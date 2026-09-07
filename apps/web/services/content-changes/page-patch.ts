import type { WidgetInstance, PageWidgetPatch } from "@courselit/common-models";
import * as hero from "../../../../packages/page-blocks/src/blocks/anahata-hero/defaults";
import { pageField } from "./page-registry";
import { requireCondition } from "./errors";
import { validateTextEdit } from "./text-safety";
import { stableJson } from "./stable";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function patchPageWidget(
    widget: WidgetInstance,
    field: string,
    patch: PageWidgetPatch,
    imageValue?: unknown,
    recovery = false,
): WidgetInstance {
    const selected = pageField(widget, field);
    const updated = clone(widget);
    updated.settings = clone(widget.settings || {});
    if (patch.kind === "restore-widget") {
        requireCondition(
            recovery,
            "unsupported_content",
            "Recovery settings must come from an applied proposal.",
        );
        updated.settings = clone(patch.settings);
        return updated;
    }
    requireCondition(
        selected.kind === patch.kind,
        "bad_request",
        "The replacement must match the selected field type.",
    );
    let value: unknown;
    if (patch.kind === "text") {
        requireCondition(
            typeof patch.text === "string" && patch.text.length <= 20000,
            "bad_request",
            "Keep this text within 20,000 characters.",
        );
        requireCondition(
            field !== "ctaCaption" || !!patch.text.trim(),
            "visibility_changed",
            "Keep the existing button label; hiding the control needs a separate review.",
        );
        value = patch.text;
    } else if (patch.kind === "rich-text") {
        validateTextEdit(selected.value as any, patch.content);
        value = patch.content;
    } else {
        requireCondition(
            imageValue,
            "bad_request",
            "Resolve the image from this site's library before preparing the replacement.",
        );
        value = imageValue;
    }
    requireCondition(
        stableJson(selected.value) !== stableJson(value),
        "no_change",
        "The proposed value is already shown on the page.",
    );
    if (field.startsWith("paragraph:")) {
        const index = Number(field.slice(10));
        const paragraphs = clone(
            (widget.settings?.paragraphs ||
                hero.paragraphs) as typeof hero.paragraphs,
        );
        const previous = paragraphs[index];
        requireCondition(
            !previous.linkText ||
                (typeof value === "string" &&
                    value.includes(previous.linkText)),
            "link_changed",
            "Keep the existing linked words in this paragraph; changing the link needs a separate review.",
        );
        paragraphs[index] = { ...previous, text: value as string };
        updated.settings.paragraphs = paragraphs;
    } else updated.settings[field] = clone(value);
    requireCondition(
        stableJson(widget.settings || {}) !== stableJson(updated.settings),
        "no_change",
        "This proposal does not change the selected field.",
    );
    return updated;
}
/** Mirror only the selected leaf into a native draft; retain every unrelated edit. */
export function mirrorPageWidgetValue(
    draft: WidgetInstance,
    after: WidgetInstance,
    field: string,
) {
    const updated = clone(draft);
    updated.settings = clone(draft.settings || {});
    if (field.startsWith("paragraph:")) {
        const index = Number(field.slice(10));
        const paragraphs = clone(
            (draft.settings?.paragraphs ||
                hero.paragraphs) as typeof hero.paragraphs,
        );
        paragraphs[index] = {
            ...paragraphs[index],
            text: pageField(after, field).value as string,
        };
        if (
            after.settings?.paragraphs === undefined &&
            stableJson(paragraphs) === stableJson(hero.paragraphs)
        )
            delete updated.settings.paragraphs;
        else updated.settings.paragraphs = paragraphs;
    } else if (after.settings?.[field] === undefined)
        delete updated.settings[field];
    else updated.settings[field] = clone(after.settings[field]);
    return updated;
}
