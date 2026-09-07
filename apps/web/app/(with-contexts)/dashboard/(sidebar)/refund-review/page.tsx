import OperatorRefunds from "@/components/refund-requests/operator";
import DashboardContent from "@/components/admin/dashboard-content";
import { refundCopy } from "@/components/refund-requests/copy";
export const metadata = { title: "Refund review" };
export default function RefundReviewPage() {
    return (
        <DashboardContent
            breadcrumbs={[
                {
                    label: refundCopy.reviewTitle,
                    href: "/dashboard/refund-review",
                },
            ]}
        >
            <OperatorRefunds />
        </DashboardContent>
    );
}
