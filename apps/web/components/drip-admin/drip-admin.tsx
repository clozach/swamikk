"use client";

import { useEffect, useState } from "react";
import type {
    DripChange,
    DripChangePatch,
    DripCourseView,
    DripSectionView,
    ReleaseRule,
} from "@courselit/common-models";
import { dripAdminUi as copy } from "@/config/strings";
import { Button } from "@/components/ui/button";

const DAY = 86400000;
const inputStyle = "w-full rounded border bg-background p-2 text-foreground";
const cardStyle = "rounded-xl border bg-background p-4 sm:p-6";
type CourseChoice = Pick<DripCourseView, "courseId" | "title" | "published">;

export function describeReleaseRule(rule: ReleaseRule): string {
    switch (rule.kind) {
        case "available":
            return copy.available;
        case "exact":
            return `${new Date(rule.at).toLocaleString(undefined, { timeZone: "UTC" })} UTC`;
        case "relative":
            return `${copy.relative}: ${rule.delayInMillis / DAY} days`;
        case "unknown":
            return copy.unknown;
    }
}
function dateText(value: string | null) {
    if (value === "released") return copy.released;
    return value
        ? `${new Date(value).toLocaleString(undefined, { timeZone: "UTC" })} UTC`
        : copy.unknownDate;
}
async function request<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
): Promise<T> {
    const response = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || copy.failed);
    return payload;
}
function MessagePreview({ section }: { section?: DripSectionView }) {
    if (!section?.notification)
        return (
            <p className="text-sm text-muted-foreground">{copy.noMessage}</p>
        );
    return (
        <div className="space-y-2">
            <h3 className="font-semibold">{copy.messagePreview}</h3>
            <p>{section.notification.subject}</p>
            <p className="text-sm text-muted-foreground">{copy.templateHelp}</p>
            {section.notification.html ? (
                <iframe
                    title={copy.messagePreview}
                    sandbox=""
                    referrerPolicy="no-referrer"
                    srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${section.notification.html}`}
                    className="h-80 w-full rounded border bg-white"
                />
            ) : (
                <p role="alert">{copy.invalidMessage}</p>
            )}
        </div>
    );
}

export default function DripAdmin() {
    const [choices, setChoices] = useState<CourseChoice[]>([]);
    const [courseId, setCourseId] = useState("");
    const [course, setCourse] = useState<DripCourseView | null>(null);
    const [patch, setPatch] = useState<DripChangePatch | null>(null);
    const [draft, setDraft] = useState<DripChange | null>(null);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [dirty, setDirty] = useState(false);
    const [reviewed, setReviewed] = useState(false);
    const selected = course?.sections.find(
        (section) => section.id === patch?.groupId,
    );

    useEffect(() => {
        const controller = new AbortController();
        request<{ courses: CourseChoice[] }>(
            "/api/drip-admin",
            undefined,
            controller.signal,
        )
            .then((result) => {
                if (controller.signal.aborted) return;
                setChoices(result.courses);
                const requested = new URLSearchParams(
                    window.location.search,
                ).get("courseId");
                setCourseId(
                    result.courses.find((item) => item.courseId === requested)
                        ?.courseId ||
                        result.courses[0]?.courseId ||
                        "",
                );
            })
            .catch((problem) => {
                if (!controller.signal.aborted) setError(problem.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, []);
    useEffect(() => {
        if (!courseId) return;
        const controller = new AbortController();
        setLoading(true);
        setError("");
        setDraft(null);
        setPatch(null);
        setCourse(null);
        request<{ course: DripCourseView }>(
            `/api/drip-admin?courseId=${encodeURIComponent(courseId)}`,
            undefined,
            controller.signal,
        )
            .then((result) => {
                if (!controller.signal.aborted) setCourse(result.course);
            })
            .catch((problem) => {
                if (!controller.signal.aborted) setError(problem.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [courseId]);
    function chooseSection(section: DripSectionView) {
        setPatch({
            groupId: section.id,
            rule:
                section.rule.kind === "unknown"
                    ? { kind: "available" }
                    : section.rule,
            groupOrder: course!.sections.map((item) => item.id),
            notificationEnabled: section.notification?.enabled || false,
        });
        setDraft(null);
        setDirty(true);
        setReviewed(false);
        setError("");
    }
    function edit(next: DripChangePatch) {
        setPatch(next);
        setDirty(true);
        setReviewed(false);
    }
    function openDraft(value: DripChange) {
        setDraft(value);
        setPatch(value.patch);
        setDirty(false);
        setReviewed(false);
        setError("");
    }
    async function act(
        action:
            | "save"
            | "approve"
            | "refresh"
            | "discard"
            | "reconcile"
            | "restore",
    ) {
        if (!patch || busy) return;
        setBusy(true);
        setError("");
        try {
            const editable =
                draft &&
                ["draft", "stale", "not-applied"].includes(draft.state.kind);
            const create = action === "save" && !editable;
            const payload = create
                ? { courseId, patch }
                : action === "save" || action === "refresh"
                  ? { action: "refresh", version: draft!.version, patch }
                  : action === "approve"
                    ? {
                          action,
                          version: draft!.version,
                          previewHash: draft!.previewHash,
                      }
                    : action === "reconcile"
                      ? { action }
                      : { action, version: draft!.version };
            const result = await request<{ change: DripChange }>(
                create ? "/api/drip-admin" : `/api/drip-admin/${draft!.id}`,
                payload,
            );
            openDraft(result.change);
            const refreshed = await request<{ course: DripCourseView }>(
                `/api/drip-admin?courseId=${encodeURIComponent(courseId)}`,
            );
            setCourse(refreshed.course);
        } catch (problem) {
            setError(problem instanceof Error ? problem.message : copy.failed);
        } finally {
            setBusy(false);
        }
    }
    function reorder(id: string, direction: -1 | 1) {
        if (!patch) return;
        const order = [...patch.groupOrder];
        const index = order.indexOf(id);
        const other = index + direction;
        if (other < 0 || other >= order.length) return;
        [order[index], order[other]] = [order[other], order[index]];
        edit({ ...patch, groupOrder: order });
    }
    const canEdit =
        !draft ||
        ["draft", "stale", "not-applied", "applied", "discarded"].includes(
            draft.state.kind,
        );
    return (
        <main
            className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8"
            data-feedback-component="release-schedule"
        >
            <header className="space-y-2">
                <h1 className="text-2xl font-semibold">{copy.title}</h1>
                <p>{copy.intro}</p>
                <p className="text-sm text-muted-foreground">{copy.timezone}</p>
            </header>
            {error && (
                <p
                    role="alert"
                    className="rounded border border-destructive p-3 text-destructive"
                >
                    {error}
                </p>
            )}
            <label className="block max-w-xl space-y-2">
                <span className="font-medium">{copy.course}</span>
                <select
                    className={inputStyle}
                    value={courseId}
                    disabled={busy}
                    onChange={(event) => setCourseId(event.target.value)}
                >
                    <option value="">{copy.choose}</option>
                    {choices.map((item) => (
                        <option key={item.courseId} value={item.courseId}>
                            {item.title}
                        </option>
                    ))}
                </select>
            </label>
            {loading && <p role="status">{copy.saving}</p>}
            {!loading && !choices.length && !error && <p>{copy.empty}</p>}
            {course && (
                <>
                    {!course.published && (
                        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-amber-950">
                            {copy.unpublished}
                        </p>
                    )}
                    <div className="grid gap-6 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
                        <section className={cardStyle}>
                            <h2 className="mb-3 font-semibold">
                                {copy.section}
                            </h2>
                            <ol className="space-y-2">
                                {course.sections.map((section) => (
                                    <li key={section.id}>
                                        <button
                                            disabled={busy}
                                            type="button"
                                            onClick={() =>
                                                chooseSection(section)
                                            }
                                            aria-pressed={
                                                patch?.groupId === section.id
                                            }
                                            className={`w-full rounded border p-3 text-left ${patch?.groupId === section.id ? "border-amber-600 bg-amber-50 text-amber-950" : "hover:bg-muted"}`}
                                        >
                                            <strong className="block">
                                                {section.name}
                                            </strong>
                                            <span className="block text-sm">
                                                {describeReleaseRule(
                                                    section.rule,
                                                )}
                                            </span>
                                            <span className="block text-xs">
                                                {section.publishedLessons}{" "}
                                                {copy.publishedLessons} ·{" "}
                                                {section.draftLessons}{" "}
                                                {copy.draftLessons}
                                            </span>
                                            {section.unknownPublicationDates >
                                                0 && (
                                                <span className="block text-xs">
                                                    {
                                                        section.unknownPublicationDates
                                                    }{" "}
                                                    {copy.legacyDates}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        </section>
                        <section className={`${cardStyle} space-y-4`}>
                            {!patch ? (
                                <p>{copy.missing}</p>
                            ) : (
                                <fieldset
                                    disabled={busy || !canEdit}
                                    className="space-y-4"
                                    data-feedback-component={`release-section-${patch.groupId}`}
                                >
                                    <legend className="mb-3 text-lg font-semibold">
                                        {selected?.name}
                                    </legend>
                                    <label className="block space-y-2">
                                        <span>{copy.rule}</span>
                                        <select
                                            className={inputStyle}
                                            value={patch.rule.kind}
                                            onChange={(event) =>
                                                edit({
                                                    ...patch,
                                                    rule:
                                                        event.target.value ===
                                                        "available"
                                                            ? {
                                                                  kind: "available",
                                                              }
                                                            : event.target
                                                                    .value ===
                                                                "exact"
                                                              ? {
                                                                    kind: "exact",
                                                                    at: new Date(
                                                                        Date.now() +
                                                                            DAY,
                                                                    ).toISOString(),
                                                                }
                                                              : {
                                                                    kind: "relative",
                                                                    delayInMillis:
                                                                        DAY,
                                                                },
                                                })
                                            }
                                        >
                                            <option
                                                value="available"
                                                disabled={
                                                    course.availabilityChangesRestricted &&
                                                    selected?.rule.kind !==
                                                        "available"
                                                }
                                            >
                                                {copy.available}
                                            </option>
                                            <option
                                                value="exact"
                                                disabled={
                                                    course.availabilityChangesRestricted &&
                                                    selected?.rule.kind ===
                                                        "available"
                                                }
                                            >
                                                {copy.exact}
                                            </option>
                                            <option
                                                value="relative"
                                                disabled={
                                                    course.availabilityChangesRestricted &&
                                                    selected?.rule.kind ===
                                                        "available"
                                                }
                                            >
                                                {copy.relative}
                                            </option>
                                        </select>
                                    </label>
                                    {patch.rule.kind === "exact" && (
                                        <label className="block space-y-2">
                                            <span>{copy.exactDate}</span>
                                            <input
                                                className={inputStyle}
                                                type="datetime-local"
                                                value={patch.rule.at.slice(
                                                    0,
                                                    16,
                                                )}
                                                onChange={(event) => {
                                                    if (event.target.value)
                                                        edit({
                                                            ...patch,
                                                            rule: {
                                                                kind: "exact",
                                                                at: new Date(
                                                                    `${event.target.value}Z`,
                                                                ).toISOString(),
                                                            },
                                                        });
                                                }}
                                            />
                                            <span className="block text-sm text-muted-foreground">
                                                {new Date(
                                                    patch.rule.at,
                                                ).toLocaleString()}{" "}
                                                (
                                                {
                                                    Intl.DateTimeFormat().resolvedOptions()
                                                        .timeZone
                                                }
                                                )
                                            </span>
                                        </label>
                                    )}
                                    {patch.rule.kind === "relative" && (
                                        <label className="block space-y-2">
                                            <span>{copy.delay}</span>
                                            <input
                                                className={inputStyle}
                                                type="number"
                                                min="0"
                                                max="3650"
                                                step="any"
                                                value={
                                                    patch.rule.delayInMillis /
                                                    DAY
                                                }
                                                onChange={(event) =>
                                                    edit({
                                                        ...patch,
                                                        rule: {
                                                            kind: "relative",
                                                            delayInMillis:
                                                                Math.round(
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value,
                                                                    ) * DAY,
                                                                ),
                                                        },
                                                    })
                                                }
                                            />
                                        </label>
                                    )}
                                    {course.availabilityChangesRestricted && (
                                        <p className="text-sm text-muted-foreground">
                                            {copy.availabilityRestriction}
                                        </p>
                                    )}
                                    <p className="text-sm text-muted-foreground">
                                        {patch.rule.kind === "relative"
                                            ? copy.delayHelp
                                            : copy.availableHelp}
                                    </p>
                                    <label className="flex items-start gap-2">
                                        <input
                                            type="checkbox"
                                            checked={patch.notificationEnabled}
                                            disabled={
                                                !selected?.notification?.html
                                            }
                                            onChange={(event) =>
                                                edit({
                                                    ...patch,
                                                    notificationEnabled:
                                                        event.target.checked,
                                                })
                                            }
                                        />
                                        <span>{copy.notification}</span>
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                        {copy.notificationHelp}
                                    </p>
                                    <details>
                                        <summary className="cursor-pointer font-medium">
                                            {copy.order}
                                        </summary>
                                        <ol className="mt-3 space-y-2">
                                            {patch.groupOrder.map(
                                                (id, index) => (
                                                    <li
                                                        key={id}
                                                        className="flex items-center justify-between gap-2 rounded border p-2"
                                                    >
                                                        <span>
                                                            {index + 1}.{" "}
                                                            {
                                                                course.sections.find(
                                                                    (item) =>
                                                                        item.id ===
                                                                        id,
                                                                )?.name
                                                            }
                                                        </span>
                                                        <div className="flex gap-1">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={
                                                                    index === 0
                                                                }
                                                                onClick={() =>
                                                                    reorder(
                                                                        id,
                                                                        -1,
                                                                    )
                                                                }
                                                                aria-label={`${copy.up}: ${course.sections.find((item) => item.id === id)?.name}`}
                                                            >
                                                                ↑
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={
                                                                    index ===
                                                                    patch
                                                                        .groupOrder
                                                                        .length -
                                                                        1
                                                                }
                                                                onClick={() =>
                                                                    reorder(
                                                                        id,
                                                                        1,
                                                                    )
                                                                }
                                                                aria-label={`${copy.down}: ${course.sections.find((item) => item.id === id)?.name}`}
                                                            >
                                                                ↓
                                                            </Button>
                                                        </div>
                                                    </li>
                                                ),
                                            )}
                                        </ol>
                                    </details>
                                    <Button
                                        type="button"
                                        onClick={() => act("save")}
                                    >
                                        {busy ? copy.saving : copy.save}
                                    </Button>
                                </fieldset>
                            )}
                        </section>
                    </div>
                    {draft && (
                        <section
                            className={`${cardStyle} space-y-5`}
                            aria-labelledby="drip-review-title"
                        >
                            <header>
                                <h2
                                    id="drip-review-title"
                                    className="text-xl font-semibold"
                                >
                                    {copy.review} · {copy.version}{" "}
                                    {draft.version}
                                </h2>
                                <p role="status" className="mt-1 font-medium">
                                    {copy.status[draft.state.kind]}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {copy.expires}:{" "}
                                    {new Date(
                                        draft.preview.expiresAt,
                                    ).toLocaleString()}
                                </p>
                            </header>
                            {draft.state.kind === "stale" && (
                                <p>{copy.stale}</p>
                            )}
                            {draft.state.kind === "applied" && (
                                <p>{copy.applied}</p>
                            )}
                            {["applying", "uncertain"].includes(
                                draft.state.kind,
                            ) && <p>{copy.uncertain}</p>}
                            {draft.state.kind === "not-applied" && (
                                <p>{draft.state.reason}</p>
                            )}
                            {dirty && <p role="status">{copy.changed}</p>}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr>
                                            <th className="p-2">
                                                {copy.section}
                                            </th>
                                            <th className="p-2">
                                                {copy.before}
                                            </th>
                                            <th className="p-2">
                                                {copy.after}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {draft.preview.after.map(
                                            (section, index) => (
                                                <tr
                                                    key={section.id}
                                                    className="border-t"
                                                >
                                                    <td className="p-2">
                                                        {index + 1}.{" "}
                                                        {section.name}
                                                    </td>
                                                    <td className="p-2">
                                                        {describeReleaseRule(
                                                            draft.preview.before.find(
                                                                (item) =>
                                                                    item.id ===
                                                                    section.id,
                                                            )!.rule,
                                                        )}{" "}
                                                        (#
                                                        {draft.preview.before.findIndex(
                                                            (item) =>
                                                                item.id ===
                                                                section.id,
                                                        ) + 1}
                                                        )
                                                    </td>
                                                    <td className="p-2">
                                                        {describeReleaseRule(
                                                            section.rule,
                                                        )}
                                                    </td>
                                                </tr>
                                            ),
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {(
                                    [
                                        [
                                            copy.currentMembers,
                                            draft.preview.impact.activeMembers,
                                        ],
                                        [
                                            copy.alreadyReleased,
                                            draft.preview.impact
                                                .alreadyReleased,
                                        ],
                                        [
                                            copy.newlyAvailable,
                                            draft.preview.impact
                                                .newlyAvailableNow,
                                        ],
                                        [
                                            copy.recipients,
                                            draft.preview.impact
                                                .notificationRecipientsNow,
                                        ],
                                        [
                                            copy.processingMembers,
                                            draft.preview.impact
                                                .processingMembers,
                                        ],
                                        [
                                            copy.endedPeriods,
                                            draft.preview.impact.endedPeriods,
                                        ],
                                        [
                                            copy.unknownAnchors,
                                            draft.preview.impact.unknownAnchors,
                                        ],
                                        [
                                            copy.pending,
                                            draft.preview.impact
                                                .pendingMessages,
                                        ],
                                        [
                                            copy.dispatching,
                                            draft.preview.impact
                                                .dispatchingMessages,
                                        ],
                                        [
                                            copy.sent,
                                            draft.preview.impact.sentMessages,
                                        ],
                                        [
                                            copy.uncertainMessages,
                                            draft.preview.impact
                                                .uncertainMessages,
                                        ],
                                    ] as const
                                ).map(([label, value]) => (
                                    <div
                                        key={label}
                                        className="rounded border p-3"
                                    >
                                        <dt className="text-sm text-muted-foreground">
                                            {label}
                                        </dt>
                                        <dd className="text-xl font-semibold">
                                            {value}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            <details open>
                                <summary className="font-medium">
                                    {copy.samples}
                                </summary>
                                <ul className="mt-2 space-y-2 text-sm">
                                    {draft.preview.impact.samples.map(
                                        (sample) => (
                                            <li key={sample.label}>
                                                {sample.label}:{" "}
                                                {dateText(sample.before)} →{" "}
                                                {dateText(sample.after)}
                                            </li>
                                        ),
                                    )}
                                </ul>
                            </details>
                            <p className="text-sm">{copy.retained}</p>
                            <p className="text-sm">{copy.inFlight}</p>
                            <p className="text-sm">{copy.notificationHelp}</p>
                            <MessagePreview
                                section={draft.preview.after.find(
                                    (section) =>
                                        section.id === draft.patch.groupId,
                                )}
                            />
                            {draft.preview.impact.notificationSectionIds
                                .filter((id) => id !== draft.patch.groupId)
                                .map((id) => (
                                    <details key={id}>
                                        <summary className="cursor-pointer font-medium">
                                            {
                                                draft.preview.after.find(
                                                    (section) =>
                                                        section.id === id,
                                                )?.name
                                            }{" "}
                                            · {copy.messagePreview}
                                        </summary>
                                        <MessagePreview
                                            section={draft.preview.after.find(
                                                (section) => section.id === id,
                                            )}
                                        />
                                    </details>
                                ))}
                            {draft.history.length > 0 && (
                                <details>
                                    <summary className="font-medium">
                                        {copy.history}
                                    </summary>
                                    <ul className="mt-2 space-y-1 text-sm">
                                        {draft.history.map((item) => (
                                            <li key={item.version}>
                                                {copy.version} {item.version} ·{" "}
                                                {new Date(
                                                    item.preparedAt,
                                                ).toLocaleString()}{" "}
                                                ·{" "}
                                                {describeReleaseRule(
                                                    item.patch.rule,
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {draft.state.kind === "draft" && (
                                <label className="flex items-start gap-2">
                                    <input
                                        type="checkbox"
                                        checked={reviewed}
                                        disabled={busy || dirty}
                                        onChange={(event) =>
                                            setReviewed(event.target.checked)
                                        }
                                    />
                                    <span>{copy.acknowledge}</span>
                                </label>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {draft.state.kind === "draft" && (
                                    <Button
                                        disabled={busy || dirty || !reviewed}
                                        onClick={() => act("approve")}
                                    >
                                        {copy.approve}
                                    </Button>
                                )}
                                {["draft", "stale", "not-applied"].includes(
                                    draft.state.kind,
                                ) && (
                                    <>
                                        <Button
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() => act("refresh")}
                                        >
                                            {copy.refresh}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() => act("discard")}
                                        >
                                            {copy.discard}
                                        </Button>
                                    </>
                                )}
                                {["applying", "uncertain"].includes(
                                    draft.state.kind,
                                ) && (
                                    <Button
                                        disabled={busy}
                                        onClick={() => act("reconcile")}
                                    >
                                        {copy.reconcile}
                                    </Button>
                                )}
                                {draft.state.kind === "applied" && (
                                    <Button
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => act("restore")}
                                    >
                                        {copy.restore}
                                    </Button>
                                )}
                            </div>
                            {draft.state.kind === "applied" && (
                                <p className="text-sm text-muted-foreground">
                                    {copy.restoreHelp}
                                </p>
                            )}
                        </section>
                    )}
                    <section className={cardStyle}>
                        <h2 className="mb-3 font-semibold">{copy.drafts}</h2>
                        {!course.changes.length ? (
                            <p>{copy.noDrafts}</p>
                        ) : (
                            <ul className="space-y-2">
                                {course.changes.map((change) => (
                                    <li key={change.id}>
                                        <button
                                            className="w-full rounded border p-3 text-left hover:bg-muted"
                                            disabled={busy}
                                            onClick={() => openDraft(change)}
                                        >
                                            {
                                                course.sections.find(
                                                    (section) =>
                                                        section.id ===
                                                        change.patch.groupId,
                                                )?.name
                                            }{" "}
                                            · {copy.version} {change.version} ·{" "}
                                            {copy.status[change.state.kind]}
                                            <span className="ml-2 text-sm text-muted-foreground">
                                                {new Date(
                                                    change.updatedAt,
                                                ).toLocaleString()}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </>
            )}
        </main>
    );
}
