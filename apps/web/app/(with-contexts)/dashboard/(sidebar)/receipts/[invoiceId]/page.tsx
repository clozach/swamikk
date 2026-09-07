import MemberReceiptPage from "@/components/member-receipts";
export const metadata = { title: "Payment receipt" };
export default async function ReceiptPage({
    params,
}: {
    params: Promise<{ invoiceId: string }>;
}) {
    const { invoiceId } = await params;
    return <MemberReceiptPage invoiceId={invoiceId} />;
}
