import type {
    HorizontalAlignment,
    TextEditorContent,
    WidgetDefaultSettings,
} from "@courselit/common-models";
import type { SectionBackground } from "@courselit/page-models";

export default interface Settings extends WidgetDefaultSettings {
    text: TextEditorContent;
    alignment: HorizontalAlignment;
    cssId?: string;
    fontSize?: number;
    /**
     * Optional band ground (solid colour or image), forwarded to the
     * Section. Absent = the theme's page ground, as before. Written by the
     * 2026-09-10 homepage redesign for the fern "home base" band; the
     * builder has no control for it yet.
     */
    background?: SectionBackground;
}
