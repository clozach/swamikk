import { useContext, useId } from "react";
import type {
    Profile,
    State,
    WidgetDefaultSettings,
} from "@courselit/common-models";
import {
    AddressContext,
    SiteInfoContext,
    ServerConfigContext,
} from "@/components/contexts";
import { defaultState } from "@/components/default-state";
import WidgetByName from "@/components/public/base-layout/template/widget-by-name";
import { generateThemeStyles } from "@/lib/theme-styles";
import {
    hasGlobalDrafts,
    type PagePublicationChange,
} from "@/services/content-changes/page-publication-types";

export default function PagePublicationPreview({
    change,
}: {
    change: PagePublicationChange;
}) {
    const scope = `publication-preview-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const address = useContext(AddressContext),
        siteinfo = useContext(SiteInfoContext),
        config = useContext(ServerConfigContext);
    const preview = change.preview;
    const state = {
        ...defaultState,
        address,
        siteinfo,
        config,
        theme: preview.theme,
        typefaces: preview.typefaces,
        auth: { guest: true, checked: true },
        profile: defaultState.profile as Profile,
        message: { open: false, message: "", action: null },
    } satisfies State;
    return (
        <div className="space-y-5" data-feedback-ui>
            <section className="rounded-xl border p-5 space-y-3">
                <h2 className="text-lg font-semibold">Publication review</h2>
                <p>
                    Title: <strong>{preview.title}</strong>
                </p>
                <p>
                    Address: <code>{preview.path}</code>
                </p>
                <p>
                    Description:{" "}
                    {preview.description || "No description supplied."}
                </p>
                <p>
                    Search engines:{" "}
                    {preview.robotsAllowed
                        ? "Indexing allowed after publication."
                        : "Indexing discouraged."}
                </p>
                <p>
                    Approval makes this saved draft visible to visitors at this
                    address, with the existing published site header and footer.
                    It does not publish shared appearance drafts, grant access,
                    or send messages.
                </p>
                <p className="text-sm text-muted-foreground">
                    This review records the current native page and its
                    revision. Changes to the draft or site appearance require a
                    refreshed review. The publication receipt remains in
                    history; later edits are separate. There is no automatic
                    undo of publication or of content visitors already saw.
                </p>
            </section>
            {hasGlobalDrafts(preview.globalDrafts) && (
                <section
                    role="status"
                    className="rounded-xl border p-5 space-y-3"
                >
                    <h2 className="font-semibold">
                        Resolve site-wide drafts before publishing
                    </h2>
                    <ul className="list-disc pl-5">
                        {preview.globalDrafts.sharedWidgets && (
                            <li>Shared header or footer drafts are pending.</li>
                        )}
                        {preview.globalDrafts.theme && (
                            <li>A theme draft is pending.</li>
                        )}
                        {preview.globalDrafts.typefaces && (
                            <li>Font drafts are pending.</li>
                        )}
                    </ul>
                    <p>
                        Those changes are outside this approval. Review and
                        resolve them separately, then refresh this publication
                        review.
                    </p>
                </section>
            )}
            <section className="rounded-xl border overflow-hidden">
                <h2 className="border-b p-5 font-semibold">
                    Exact saved page body
                </h2>
                <div className={scope} inert>
                    {preview.layout
                        .filter((widget) => !widget.shared)
                        .map((widget) => (
                            <WidgetByName
                                key={widget.widgetId}
                                id={widget.widgetId}
                                name={widget.name}
                                settings={
                                    widget.settings as unknown as WidgetDefaultSettings
                                }
                                state={state}
                                pageData={{ pageType: "site" }}
                                editing={false}
                            />
                        ))}
                    <style>
                        {generateThemeStyles(preview.theme).replaceAll(
                            ".courselit-theme",
                            `.${scope}`,
                        )}
                    </style>
                </div>
            </section>
        </div>
    );
}
