"use client";

import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { checkPermission } from "@courselit/utils";
import { UIConstants } from "@courselit/common-models";
import { ProfileContext } from "@components/contexts";
import { useGraphQLFetch } from "@/hooks/use-graphql-fetch";
import { Button } from "@/components/ui/button";
import { feedbackUi as copy } from "@config/strings";

interface ContentRow {
    courseId: string;
    title: string;
    slug: string;
    published: boolean;
    customers: number;
}
type ContentState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; rows: ContentRow[]; total: number };
const limit = 20;

export default function ContentOverview() {
    const { profile } = useContext(ProfileContext);
    const allowed = checkPermission(profile?.permissions || [], [
        UIConstants.permissions.manageCourse,
        UIConstants.permissions.manageAnyCourse,
    ]);
    const [page, setPage] = useState(1);
    const [retry, setRetry] = useState(0);
    const [state, setState] = useState<ContentState>({ kind: "loading" });
    const fetcher = useGraphQLFetch();
    useEffect(() => {
        if (!allowed) return;
        let active = true;
        fetcher
            .setPayload({
                query: `query ($page: Int, $limit: Int) { products: getProducts(page: $page, limit: $limit, publicView: false) { courseId title slug published customers } total: getProductsCount(publicView: false) }`,
                variables: { page, limit },
            })
            .build()
            .exec()
            .then((result) => {
                if (active)
                    setState({
                        kind: "ready",
                        rows: result.products,
                        total: result.total,
                    });
            })
            .catch(() => {
                if (active) setState({ kind: "error" });
            });
        return () => {
            active = false;
        };
    }, [allowed, page, retry, fetcher]);
    if (!profile) return <p className="p-8">{copy.loading}</p>;
    if (!allowed) return <p className="p-8">{copy.accessDenied}</p>;
    return (
        <main
            className="mx-auto max-w-6xl p-4 md:p-8 pb-28"
            data-feedback-id="content-overview"
            data-feedback-label={copy.organize}
        >
            <h1 className="text-3xl font-semibold mb-3">{copy.organize}</h1>
            <p className="text-muted-foreground mb-8 max-w-2xl">
                {copy.contentGuide}
            </p>
            {state.kind === "loading" && <p role="status">{copy.loading}</p>}
            {state.kind === "error" && (
                <div role="alert">
                    <p>{copy.loadFailed}</p>
                    <Button
                        className="min-h-11 mt-4"
                        onClick={() => {
                            setState({ kind: "loading" });
                            setRetry((value) => value + 1);
                        }}
                    >
                        {copy.reload}
                    </Button>
                </div>
            )}
            {state.kind === "ready" &&
                (!state.rows.length ? (
                    <p>{copy.contentEmpty}</p>
                ) : (
                    <>
                        <div className="overflow-x-auto rounded-xl border">
                            <table className="w-full text-left">
                                <thead className="bg-muted/40">
                                    <tr>
                                        {[
                                            copy.title,
                                            copy.status,
                                            copy.members,
                                            copy.preview,
                                        ].map((title) => (
                                            <th
                                                key={title}
                                                className="p-4 font-medium text-sm"
                                            >
                                                {title}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {state.rows.map((row) => (
                                        <tr
                                            key={row.courseId}
                                            className="border-t"
                                            data-feedback-id={`product-${row.courseId}`}
                                            data-feedback-label={row.title}
                                        >
                                            <td className="p-4 font-medium">
                                                {row.title}
                                            </td>
                                            <td className="p-4 text-sm">
                                                {row.published
                                                    ? copy.published
                                                    : copy.unpublished}
                                            </td>
                                            <td className="p-4 tabular-nums">
                                                {row.customers}
                                            </td>
                                            <td className="p-4">
                                                <Link
                                                    className="inline-flex min-h-11 items-center underline"
                                                    href={`/course/${encodeURIComponent(row.slug || row.courseId)}/${encodeURIComponent(row.courseId)}?preview=true`}
                                                >
                                                    {copy.preview}
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <nav className="mt-5 flex justify-between">
                            <Button
                                className="min-h-11"
                                variant="outline"
                                disabled={page === 1}
                                onClick={() => {
                                    setState({ kind: "loading" });
                                    setPage((value) => value - 1);
                                }}
                            >
                                {copy.previous}
                            </Button>
                            <Button
                                className="min-h-11"
                                variant="outline"
                                disabled={page * limit >= state.total}
                                onClick={() => {
                                    setState({ kind: "loading" });
                                    setPage((value) => value + 1);
                                }}
                            >
                                {copy.next}
                            </Button>
                        </nav>
                    </>
                ))}
        </main>
    );
}
