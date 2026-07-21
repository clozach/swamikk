"use client";

import { useContext, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { X } from "lucide-react";
import { FetchBuilder } from "@courselit/utils";
import { AddressContext } from "@components/contexts";
import DashboardContent from "@components/admin/dashboard-content";
import { DASHBOARD_PAGE_HEADER } from "@ui-config/strings";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@components/ui/dialog";
import { Skeleton } from "@components/ui/skeleton";
import { useToast, Badge } from "@courselit/components-library";
import { UIConstants } from "@courselit/common-models";
const { permissions } = UIConstants;

interface PurchaseWithProduct {
    purchaseId: string;
    invoiceId: string;
    userId: string | null;
    userEmail: string | null;
    userName: string | null;
    amount: number;
    currencyISOCode: string | null;
    status: string;
    isTest: boolean;
    createdAt: string | null;
    courseId: string;
    productTitle: string;
}

const formatAmount = (p: PurchaseWithProduct) =>
    `${p.amount}${p.currencyISOCode ? " " + p.currencyISOCode.toUpperCase() : ""}`;

const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString() : "—";

const breadcrumbs = [
    { label: DASHBOARD_PAGE_HEADER, href: "/dashboard/overview" },
    { label: "Transactions", href: "#" },
];

export default function AllTransactionsPage() {
    const address = useContext(AddressContext);
    const { toast } = useToast();

    const [purchases, setPurchases] = useState<PurchaseWithProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [confirmTarget, setConfirmTarget] =
        useState<PurchaseWithProduct | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchPurchases = async () => {
        setLoading(true);
        const query = `
            query GetAllPurchases {
                purchases: getAllPurchases {
                    purchaseId
                    invoiceId
                    userId
                    userEmail
                    userName
                    amount
                    currencyISOCode
                    status
                    isTest
                    createdAt
                    courseId
                    productTitle
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({ query })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            const response = await fetch.exec();
            setPurchases(response.purchases || []);
        } catch (err: any) {
            toast({
                title: "Error",
                description: err?.message || "Could not load transactions.",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPurchases();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDelete = async (purchase: PurchaseWithProduct) => {
        setDeleting(true);
        const mutation = `
            mutation DeleteTestPurchase($courseId: String!, $purchaseId: String!) {
                deleteTestPurchase(courseId: $courseId, purchaseId: $purchaseId)
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query: mutation,
                variables: {
                    courseId: purchase.courseId,
                    purchaseId: purchase.purchaseId,
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            const response = await fetch.exec();
            if (response.deleteTestPurchase) {
                setPurchases((prev) =>
                    prev.filter((p) => p.purchaseId !== purchase.purchaseId),
                );
                toast({
                    title: "Test transaction removed",
                    description: "Sales figures will reflect this shortly.",
                });
            }
        } catch (err: any) {
            toast({
                title: "Could not remove",
                description: err?.message || "Something went wrong.",
            });
        } finally {
            setDeleting(false);
            setConfirmTarget(null);
        }
    };

    return (
        <DashboardContent
            breadcrumbs={breadcrumbs}
            permissions={[
                permissions.manageAnyCourse,
                permissions.manageCourse,
            ]}
        >
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold">Transactions</h1>
                <p className="text-sm text-muted-foreground">
                    Every purchase recorded across all your products. Test-mode
                    purchases can be removed with the red ✕ so they stop
                    inflating your sales — live payments have no ✕ and are never
                    deletable here.
                </p>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead className="text-right">Remove</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        Array(4)
                            .fill(0)
                            .map((_, index) => (
                                <TableRow key={index}>
                                    {Array(7)
                                        .fill(0)
                                        .map((__, cell) => (
                                            <TableCell key={cell}>
                                                <Skeleton className="h-4 w-[80px]" />
                                            </TableCell>
                                        ))}
                                </TableRow>
                            ))
                    ) : purchases.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={7}
                                className="text-center text-muted-foreground py-8"
                            >
                                No transactions yet.
                            </TableCell>
                        </TableRow>
                    ) : (
                        purchases.map((purchase) => (
                            <TableRow key={purchase.purchaseId}>
                                <TableCell>
                                    {formatDate(purchase.createdAt)}
                                </TableCell>
                                <TableCell>
                                    <a
                                        href={`/dashboard/product/${purchase.courseId}`}
                                        className="underline underline-offset-4 hover:text-foreground"
                                    >
                                        {purchase.productTitle}
                                    </a>
                                </TableCell>
                                <TableCell className="font-medium">
                                    {purchase.userEmail ||
                                        purchase.userName || (
                                            <span className="text-muted-foreground">
                                                deleted user
                                            </span>
                                        )}
                                </TableCell>
                                <TableCell>{formatAmount(purchase)}</TableCell>
                                <TableCell className="capitalize">
                                    {purchase.status}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={
                                            purchase.isTest
                                                ? "secondary"
                                                : "default"
                                        }
                                    >
                                        {purchase.isTest ? "Test" : "Live"}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    {purchase.isTest ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            aria-label="Remove test transaction"
                                            title="Remove test transaction"
                                            onClick={() =>
                                                setConfirmTarget(purchase)
                                            }
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    ) : (
                                        <span className="text-muted-foreground">
                                            —
                                        </span>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <Dialog
                open={!!confirmTarget}
                onOpenChange={(open) => !open && setConfirmTarget(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove test transaction?</DialogTitle>
                        <DialogDescription>
                            {confirmTarget && (
                                <>
                                    This permanently clears{" "}
                                    <strong>
                                        {confirmTarget.userEmail ||
                                            confirmTarget.userName ||
                                            "a deleted user"}
                                    </strong>{" "}
                                    from{" "}
                                    <strong>
                                        {confirmTarget.productTitle}
                                    </strong>{" "}
                                    — the sale, the customer, the invoice and
                                    their access ({formatAmount(confirmTarget)}
                                    ). Only test-mode purchases can be removed,
                                    and this can&apos;t be undone from here.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setConfirmTarget(null)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                confirmTarget && handleDelete(confirmTarget)
                            }
                            disabled={deleting}
                        >
                            {deleting ? "Removing…" : "Remove"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </DashboardContent>
    );
}
