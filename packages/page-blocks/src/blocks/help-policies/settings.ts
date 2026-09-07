import type { WidgetDefaultSettings } from "@courselit/common-models";

export interface PolicyTopic {
    id: string;
    title: string;
    summary: string;
    full: string;
}
export default interface Settings extends WidgetDefaultSettings {
    variant?: "terms" | "privacy" | "help";
    title?: string;
    intro?: string;
    updated?: string;
    topics?: PolicyTopic[];
    cssId?: string;
}
