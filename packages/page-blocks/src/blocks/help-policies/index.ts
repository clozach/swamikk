import type { Widget as WidgetType } from "@courselit/common-models";
import { Constants } from "@courselit/common-models";
import Widget from "./widget";
import AdminWidget from "./admin-widget";
export const HelpPolicies: WidgetType = {
    widget: Widget,
    adminWidget: AdminWidget,
    metadata: {
        name: "helpPolicies",
        displayName: "Help and policy topics",
        compatibleWith: [Constants.PageType.SITE],
    },
};
