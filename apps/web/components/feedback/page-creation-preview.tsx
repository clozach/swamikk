import Link from "next/link";
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
import type { PageCreationChange } from "@/services/content-changes/page-creation-types";

export default function PageCreationPreview({
    change,
}: {
    change: PageCreationChange;
}) {
    const scope = `creation-preview-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
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
    return (
        <div className="space-y-5" data-feedback-ui>
            <section className="rounded-xl border p-5 space-y-3">
                <h2 className="text-lg font-semibold">New unpublished page</h2>
                <p>
                    Title: <strong>{change.preview.title}</strong>
                </p>
                <p>
                    Address: <code>{change.preview.path}</code>
                </p>
                <p>
                    Approval creates this exact text in the native page editor.
                    The page stays hidden from visitors until a separate Publish
                    action. It uses the existing site header and footer.
                </p>
                <p>
                    Creation does not publish shared header/footer, theme or
                    font drafts, grant access, or send messages. Pending
                    site-wide drafts must be reviewed separately before first
                    publication.
                </p>
                <p className="text-sm text-muted-foreground">
                    The prompt, source material, approved version and result
                    identity remain in the admin history. Later native edits are
                    separate from this original creation receipt.
                </p>
            </section>
            <details className="rounded-xl border p-5">
                <summary className="min-h-11 cursor-pointer">
                    Prompt and source material
                </summary>
                <p className="whitespace-pre-wrap mt-3">
                    {change.patch.intent}
                </p>
                <p className="whitespace-pre-wrap mt-4">
                    {change.patch.materials || "No source material supplied."}
                </p>
            </details>
            <section className="rounded-xl border overflow-hidden">
                <h2 className="border-b p-5 font-semibold">
                    Exact proposed page body
                </h2>
                <div className={scope} inert>
                    {change.preview.layout
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
                        {generateThemeStyles(change.baseline.theme).replaceAll(
                            ".courselit-theme",
                            `.${scope}`,
                        )}
                    </style>
                </div>
            </section>
            {change.state.kind === "applied" && (
                <Link
                    className="inline-flex min-h-11 items-center underline"
                    href={`/dashboard/page/${encodeURIComponent(change.target.pageId)}?documentId=${change.baseline.documentId}&redirectTo=/dashboard/changes/${encodeURIComponent(change.id)}`}
                >
                    Open native draft editor
                </Link>
            )}
        </div>
    );
}
