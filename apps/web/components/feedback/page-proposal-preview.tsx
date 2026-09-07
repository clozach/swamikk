import { useContext, useId } from "react";
import {
    AddressContext,
    ServerConfigContext,
    SiteInfoContext,
} from "@/components/contexts";
import { defaultState } from "@/components/default-state";
import WidgetByName from "@/components/public/base-layout/template/widget-by-name";
import { generateThemeStyles } from "@/lib/theme-styles";
import type {
    State,
    Profile,
    WidgetDefaultSettings,
} from "@courselit/common-models";
import type { PageWidgetChangeVersion } from "@courselit/common-models";

export default function PageProposalPreview({
    change,
}: {
    change: PageWidgetChangeVersion;
}) {
    const previewScope = `page-preview-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const address = useContext(AddressContext),
        siteinfo = useContext(SiteInfoContext),
        config = useContext(ServerConfigContext);
    const state = {
        ...defaultState,
        address,
        siteinfo,
        config,
        theme: change.baseline.theme,
        typefaces: change.baseline.typefaces,
        auth: { guest: true, checked: true },
        profile: defaultState.profile as Profile,
        message: { open: false, message: "", action: null },
    } satisfies State;
    const fallback = change.preview.after.rotatingFallback;
    return (
        <div className="space-y-5" data-feedback-ui>
            {fallback && (
                <p className="rounded-lg border p-4 text-sm">
                    This edits the banner opening and fallback image. These
                    previews hold that image still so you can compare it. Social
                    photo rotation will continue on the live page.
                </p>
            )}
            {change.preview.before.defaultDerived && (
                <p className="text-sm">
                    The current value comes from the default for this block.
                    Approval stores your replacement explicitly; recovery can
                    restore the default.
                </p>
            )}
            <div className="grid gap-5 xl:grid-cols-2">
                {(["before", "after"] as const).map((side) => {
                    const snapshot = change.preview[side];
                    const settings = {
                        ...(snapshot.renderSettings ||
                            snapshot.widget.settings),
                        ...(snapshot.rotatingFallback
                            ? { bannerMode: { kind: "static" } }
                            : {}),
                    };
                    return (
                        <section
                            key={side}
                            className="min-w-0 overflow-hidden rounded-xl border"
                        >
                            <h2 className="border-b px-5 py-3 font-semibold">
                                {side === "before" ? "Before" : "After"}
                            </h2>
                            {typeof snapshot.fieldValue === "string" && (
                                <p className="whitespace-pre-wrap break-words border-b bg-muted/30 px-5 py-4">
                                    {snapshot.fieldValue || "(Empty text)"}
                                </p>
                            )}
                            <div
                                className={`${previewScope} max-h-[42rem] overflow-auto`}
                                inert
                            >
                                <WidgetByName
                                    id={`${snapshot.widget.widgetId}-${side}`}
                                    name={snapshot.widget.name}
                                    settings={settings as WidgetDefaultSettings}
                                    state={state}
                                    pageData={{
                                        pageType: change.baseline.pageType,
                                    }}
                                    editing={false}
                                />
                                <style>
                                    {generateThemeStyles(
                                        change.baseline.theme,
                                    ).replaceAll(
                                        ".courselit-theme",
                                        `.${previewScope}`,
                                    )}
                                </style>
                            </div>
                        </section>
                    );
                })}
            </div>
            <section className="space-y-2 rounded-xl border bg-muted/30 p-5">
                <h2 className="text-lg font-semibold">What approval changes</h2>
                <p>
                    This replaces the selected field on the published page. The
                    block identity, order, styling and other fields stay as they
                    are.
                </p>
                <p>
                    {change.baseline.draft === "mirrored-leaf"
                        ? "The matching field in the saved draft is updated too; all other unpublished work stays unpublished."
                        : "No native page draft is published by this action."}
                </p>
                <p>
                    Shared navigation, fonts, theme, payments and member access
                    are unchanged. Recovery is a separate proposal requiring
                    approval, and it will preserve later edits.
                </p>
            </section>
        </div>
    );
}
