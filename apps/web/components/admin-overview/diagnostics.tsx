import type { AdminOverview } from "@/services/admin-overview/types";
import { overviewCopy as copy, sourceLabels } from "./copy";
import { Timestamp } from "./shared";

export default function Diagnostics({
    view,
    expanded,
}: {
    view: AdminOverview;
    expanded: boolean;
}) {
    return (
        <section className="space-y-4" aria-labelledby="coverage-heading">
            <h2 id="coverage-heading" className="text-2xl font-semibold">
                Coverage and freshness
            </h2>
            <p>{copy.coverage}</p>
            <p className="text-sm">{copy.limits}</p>
            <details open={expanded} className="rounded border p-4">
                <summary className="cursor-pointer font-medium">
                    Inspect {view.sources.length} data sources
                </summary>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <caption className="sr-only">
                            Existing operational sources, read status and last
                            recorded update
                        </caption>
                        <thead>
                            <tr>
                                <th className="p-2">Source</th>
                                <th className="p-2">Read result</th>
                                <th className="p-2">
                                    Latest record in this selection
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {view.sources.map((source) => (
                                <tr key={source.source} className="border-t">
                                    <th scope="row" className="p-2 font-normal">
                                        {sourceLabels[source.source]}
                                    </th>
                                    <td className="p-2">
                                        {source.state === "unavailable"
                                            ? "Unavailable — no count"
                                            : `${source.loaded} ${source.source === "products" ? "counted" : "loaded"}${source.limited ? " — limited" : ""}`}
                                    </td>
                                    <td className="p-2">
                                        <Timestamp at={source.latestRecordAt} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
            <div className="space-y-2 rounded border p-4">
                <h3 className="font-semibold">Signals not available here</h3>
                <p>{copy.uncollected}</p>
                <p>
                    Production collection, access, consent and retention
                    decisions remain separate. This view does not enable a
                    collector.
                </p>
            </div>
            {expanded && (
                <div className="space-y-3 rounded border p-4">
                    <h3 className="font-semibold">When something needs help</h3>
                    <p>{copy.recovery}</p>
                    <p>{copy.report}</p>
                    <p className="break-all text-sm">
                        Snapshot ID: {view.snapshotId}
                    </p>
                </div>
            )}
        </section>
    );
}
