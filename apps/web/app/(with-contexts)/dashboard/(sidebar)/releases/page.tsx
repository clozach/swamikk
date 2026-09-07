import DripAdmin from "@/components/drip-admin/drip-admin";
import DashboardContent from "@/components/admin/dashboard-content";
import { dripAdminUi } from "@/config/strings";

export default function ReleaseSchedulePage() {
    return (
        <DashboardContent
            breadcrumbs={[
                { label: dripAdminUi.title, href: "/dashboard/releases" },
            ]}
        >
            <DripAdmin />
        </DashboardContent>
    );
}
