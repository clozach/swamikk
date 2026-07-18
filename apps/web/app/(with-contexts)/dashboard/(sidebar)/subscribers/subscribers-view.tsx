"use client";

import DashboardContent from "@components/admin/dashboard-content";
import { AddressContext, ProfileContext } from "@components/contexts";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@components/ui/table";
import { Button } from "@components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@components/ui/alert-dialog";
import { UIConstants } from "@courselit/common-models";
import { Skeleton, useToast } from "@courselit/components-library";
import { checkPermission, FetchBuilder } from "@courselit/utils";
import { formattedLocaleDate } from "@ui-lib/utils";
import {
    APP_MESSAGE_SUBSCRIBER_UNSUBSCRIBED,
    BROADCASTS,
    BTN_EXPORT_CSV,
    BTN_MESSAGE_SUBSCRIBERS,
    BTN_UNSUBSCRIBE,
    BUTTON_CANCEL_TEXT,
    SUBSCRIBERS_COUNT_PLURAL,
    SUBSCRIBERS_COUNT_SINGULAR,
    SUBSCRIBERS_CSV_FILENAME,
    SUBSCRIBERS_EMPTY,
    SUBSCRIBERS_HEADER,
    SUBSCRIBERS_SUBTITLE,
    SUBSCRIBERS_TABLE_HEADER_ACTIONS,
    SUBSCRIBERS_TABLE_HEADER_EMAIL,
    SUBSCRIBERS_TABLE_HEADER_NAME,
    SUBSCRIBERS_TABLE_HEADER_SUBSCRIBED,
    SUBSCRIBERS_UNSUBSCRIBE_ACTION_LOADING,
    SUBSCRIBERS_UNSUBSCRIBE_CONFIRM,
    SUBSCRIBERS_UNSUBSCRIBE_DIALOG_DESCRIPTION,
    SUBSCRIBERS_UNSUBSCRIBE_DIALOG_TITLE,
    TOAST_TITLE_ERROR,
    TOAST_TITLE_SUCCESS,
} from "@ui-config/strings";
import { Download, Loader2, MessageSquare, UserMinus } from "lucide-react";
import Link from "next/link";
import { useCallback, useContext, useEffect, useState } from "react";

const { permissions } = UIConstants;

const breadcrumbs = [{ label: SUBSCRIBERS_HEADER, href: "#" }];

const PAGE_SIZE = 50;
const EM_DASH = "—";

interface Subscriber {
    userId: string;
    email: string;
    name?: string;
    subscribedAt?: string;
}

// Wrap every field so commas, quotes, and newlines in a name can't shift
// columns; RFC-4180 escaping doubles embedded quotes.
const csvCell = (value: string) => `"${String(value).replace(/"/g, '""')}"`;

export default function SubscribersView() {
    const address = useContext(AddressContext);
    const { profile } = useContext(ProfileContext);
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    // Whether a further page likely exists, captured from the fetched page's
    // size at load time. Kept separate from `subscribers.length` on purpose:
    // an optimistic Unsubscribe shrinks the live array, and deriving
    // Next-availability from that shrinking count would hide the Next button
    // (stranding the admin from later pages) the moment they unsubscribe a row
    // on a full page. This flag only changes when a new page is fetched.
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(1);
    const [target, setTarget] = useState<Subscriber | null>(null);
    const [isUnsubscribing, setIsUnsubscribing] = useState(false);

    const loadSubscribers = useCallback(async () => {
        setLoading(true);
        const query = `
            query ($page: Int, $limit: Int) {
                subscribers: getSubscribers(page: $page, limit: $limit) {
                    userId
                    email
                    name
                    subscribedAt
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query,
                variables: { page, limit: PAGE_SIZE },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            const response = await fetch.exec();
            if (response.subscribers) {
                setSubscribers(response.subscribers);
                // A full page implies there may be another; a short page is
                // definitively the last. Snapshot this before any optimistic
                // mutation touches the array.
                setHasMore(response.subscribers.length === PAGE_SIZE);
            }
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [address.backend, page, toast]);

    useEffect(() => {
        if (
            checkPermission(profile?.permissions ?? [], [
                permissions.manageUsers,
            ])
        ) {
            loadSubscribers();
        }
    }, [loadSubscribers, profile?.permissions]);

    const handleExportCsv = useCallback(() => {
        const header = [
            SUBSCRIBERS_TABLE_HEADER_EMAIL,
            SUBSCRIBERS_TABLE_HEADER_NAME,
            SUBSCRIBERS_TABLE_HEADER_SUBSCRIBED,
        ];
        const rows = subscribers.map((s) => [
            s.email,
            s.name ?? "",
            s.subscribedAt ?? "",
        ]);
        // \r\n line endings + a UTF-8 BOM keep Excel happy with non-ASCII names.
        const csv = [header, ...rows]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n");
        const blob = new Blob(["﻿" + csv], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = SUBSCRIBERS_CSV_FILENAME;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, [subscribers]);

    const handleUnsubscribe = useCallback(async () => {
        if (!target) {
            return;
        }
        const mutation = `
            mutation ($id: ID!) {
                user: updateUser(userData: { id: $id, subscribedToUpdates: false }) {
                    userId
                    subscribedToUpdates
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query: mutation,
                variables: { id: target.userId },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            setIsUnsubscribing(true);
            const response = await fetch.exec();
            if (response.user) {
                setSubscribers((prev) =>
                    prev.filter((s) => s.userId !== target.userId),
                );
                toast({
                    title: TOAST_TITLE_SUCCESS,
                    description: APP_MESSAGE_SUBSCRIBER_UNSUBSCRIBED,
                });
                setTarget(null);
            }
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setIsUnsubscribing(false);
        }
    }, [address.backend, target, toast]);

    const count = subscribers.length;
    const countLabel =
        count === 1 ? SUBSCRIBERS_COUNT_SINGULAR : SUBSCRIBERS_COUNT_PLURAL;
    const hasPrev = page > 1;
    const hasNext = hasMore;

    return (
        <DashboardContent
            breadcrumbs={breadcrumbs}
            permissions={[permissions.manageUsers]}
        >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-4xl font-semibold">
                        {SUBSCRIBERS_HEADER}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {loading
                            ? SUBSCRIBERS_SUBTITLE
                            : `${count} ${countLabel}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handleExportCsv}
                        disabled={loading || count === 0}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        {BTN_EXPORT_CSV}
                    </Button>
                    <Button asChild>
                        <Link href={`/dashboard/mails?tab=${BROADCASTS}`}>
                            <MessageSquare className="mr-2 h-4 w-4" />
                            {BTN_MESSAGE_SUBSCRIBERS}
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="mt-8 w-full">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="font-medium text-muted-foreground">
                                {SUBSCRIBERS_TABLE_HEADER_EMAIL}
                            </TableHead>
                            <TableHead className="font-medium text-muted-foreground">
                                {SUBSCRIBERS_TABLE_HEADER_NAME}
                            </TableHead>
                            <TableHead className="font-medium text-muted-foreground">
                                {SUBSCRIBERS_TABLE_HEADER_SUBSCRIBED}
                            </TableHead>
                            <TableHead className="text-right font-medium text-muted-foreground">
                                <span className="sr-only">
                                    {SUBSCRIBERS_TABLE_HEADER_ACTIONS}
                                </span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array(5)
                                .fill(0)
                                .map((_, index) => (
                                    <TableRow key={index}>
                                        <TableCell>
                                            <Skeleton className="h-5 w-[220px]" />
                                        </TableCell>
                                        <TableCell>
                                            <Skeleton className="h-5 w-[160px]" />
                                        </TableCell>
                                        <TableCell>
                                            <Skeleton className="h-5 w-[120px]" />
                                        </TableCell>
                                        <TableCell>
                                            <Skeleton className="ml-auto h-8 w-[120px]" />
                                        </TableCell>
                                    </TableRow>
                                ))
                        ) : count === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={4}
                                    className="py-10 text-center text-muted-foreground"
                                >
                                    {SUBSCRIBERS_EMPTY}
                                </TableCell>
                            </TableRow>
                        ) : (
                            subscribers.map((subscriber) => (
                                <TableRow key={subscriber.userId}>
                                    <TableCell className="font-medium">
                                        {subscriber.email}
                                    </TableCell>
                                    <TableCell>
                                        {subscriber.name ? (
                                            subscriber.name
                                        ) : (
                                            <span className="text-muted-foreground">
                                                {EM_DASH}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {subscriber.subscribedAt
                                            ? formattedLocaleDate(
                                                  subscriber.subscribedAt,
                                              )
                                            : EM_DASH}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
                                            onClick={() =>
                                                setTarget(subscriber)
                                            }
                                        >
                                            <UserMinus className="mr-2 h-4 w-4" />
                                            {BTN_UNSUBSCRIBE}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {(hasPrev || hasNext) && (
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!hasPrev || loading}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!hasNext || loading}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            Next
                        </Button>
                    </div>
                )}
            </div>

            <AlertDialog
                open={target !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setTarget(null);
                        setIsUnsubscribing(false);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {SUBSCRIBERS_UNSUBSCRIBE_DIALOG_TITLE}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {SUBSCRIBERS_UNSUBSCRIBE_DIALOG_DESCRIPTION}
                            {target ? ` (${target.email})` : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isUnsubscribing}>
                            {BUTTON_CANCEL_TEXT}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                // Keep the dialog mounted through the request so
                                // the loading state is visible; close on success.
                                event.preventDefault();
                                handleUnsubscribe();
                            }}
                            disabled={isUnsubscribing}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isUnsubscribing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {SUBSCRIBERS_UNSUBSCRIBE_ACTION_LOADING}
                                </>
                            ) : (
                                SUBSCRIBERS_UNSUBSCRIBE_CONFIRM
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardContent>
    );
}
