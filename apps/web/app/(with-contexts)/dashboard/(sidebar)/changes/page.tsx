import ReviewHub from "@components/feedback/review-hub";
import DashboardContent from "@/components/admin/dashboard-content";

export default function ChangesPage() {
    return (
        <DashboardContent
            breadcrumbs={[{ label: "Changes", href: "/dashboard/changes" }]}
        >
            <ReviewHub />
        </DashboardContent>
    );
}
