import AdminWidget from "./admin-widget";
import metadata from "./metadata";
import Widget from "./widget";
import { Widget as WidgetType } from "@courselit/common-models";

export const AnahataPosts: WidgetType = {
    widget: Widget,
    metadata,
    adminWidget: AdminWidget,
};
