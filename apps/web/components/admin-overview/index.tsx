"use client";

import { useContext, useEffect, useState } from "react";
import { ProfileContext } from "@/components/contexts";
import DashboardContent from "@/components/admin/dashboard-content";
import { ADMIN_PERMISSIONS } from "@ui-config/constants";
import { UIConstants } from "@courselit/common-models";
import { useMemberMimic } from "@/components/member-mimic/context";
import type { AdminOverview } from "@/services/admin-overview/types";
import AttentionList from "./attention-list";
import OverviewSummary from "./summary";
import Diagnostics from "./diagnostics";
import { OperationalLink, Timestamp } from "./shared";
import { overviewCopy as copy } from "./copy";

export default function AdminOverviewPage({
    diagnostics = false,
}: {
    diagnostics?: boolean;
}) {
    const { profile } = useContext(ProfileContext);
    const mimic = useMemberMimic();
    const title = diagnostics ? copy.supportTitle : copy.title;
    const allowed =
        profile?.permissions?.includes(
            UIConstants.permissions.manageSettings,
        ) && mimic.kind === "inactive";
    return (
        <DashboardContent
            breadcrumbs={[{ label: title, href: "#" }]}
            permissions={ADMIN_PERMISSIONS}
        >
            <h1 className="mb-6 text-3xl font-semibold">{title}</h1>
            {!profile?.userId ? (
                <p role="status">{copy.loading}</p>
            ) : allowed ? (
                <Snapshot
                    key={`${profile.userId}:${diagnostics}`}
                    diagnostics={diagnostics}
                />
            ) : (
                <p role="status">{copy.permission}</p>
            )}
        </DashboardContent>
    );
}
type State =
    | { kind: "loading" }
    | { kind: "failed" }
    | { kind: "ready"; view: AdminOverview };
function Snapshot({ diagnostics }: { diagnostics: boolean }) {
    const [days, setDays] = useState<7 | 30>(7);
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState<State>({ kind: "loading" });
    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/admin-overview?days=${days}`, {
            cache: "no-store",
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error();
                return response.json() as Promise<AdminOverview>;
            })
            .then((view) => {
                if (!controller.signal.aborted)
                    setState({ kind: "ready", view });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ kind: "failed" });
            });
        return () => controller.abort();
    }, [days, revision]);
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2">
                    Payment period
                    <select
                        aria-label="Payment period"
                        className="rounded border bg-background p-2"
                        value={days}
                        onChange={(event) => {
                            const next = event.target.value === "30" ? 30 : 7;
                            if (next !== days) {
                                setState({ kind: "loading" });
                                setDays(next);
                            }
                        }}
                    >
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                    </select>
                </label>
                <button
                    className="rounded border px-4 py-2 disabled:opacity-50"
                    disabled={state.kind === "loading"}
                    onClick={() => {
                        setState({ kind: "loading" });
                        setRevision((n) => n + 1);
                    }}
                >
                    {copy.refresh}
                </button>
                <OperationalLink
                    href={
                        diagnostics
                            ? "/dashboard/overview"
                            : "/dashboard/support"
                    }
                >
                    {diagnostics
                        ? "Open overview"
                        : "Open support & diagnostics"}
                </OperationalLink>
            </div>
            {state.kind === "loading" && <p role="status">{copy.loading}</p>}
            {state.kind === "failed" && <p role="alert">{copy.failed}</p>}
            {state.kind === "ready" && (
                <>
                    <p className="text-sm text-muted-foreground">
                        Snapshot read <Timestamp at={state.view.generatedAt} />.
                        Payment period starts{" "}
                        <Timestamp at={state.view.periodStart} />. Operational
                        attention includes older unresolved records.
                    </p>
                    {state.view.sources.some((item) => item.limited) && (
                        <p className="rounded border border-amber-500 p-3">
                            This snapshot is limited. Counts below describe the
                            loaded records; inspect coverage before using them
                            as totals.
                        </p>
                    )}
                    {!diagnostics && <OverviewSummary view={state.view} />}
                    <AttentionList view={state.view} />
                    <Diagnostics view={state.view} expanded={diagnostics} />
                </>
            )}
        </div>
    );
}
