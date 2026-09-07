import type { Widget as WidgetType } from "@courselit/common-models";
import { Constants } from "@courselit/common-models";
import Widget from "./widget";
import AdminWidget from "./admin-widget";
export const MemberContact: WidgetType = {
    widget: Widget,
    adminWidget: AdminWidget,
    metadata: {
        name: "memberContact",
        displayName: "Member help and contact",
        compatibleWith: [Constants.PageType.SITE],
    },
};
