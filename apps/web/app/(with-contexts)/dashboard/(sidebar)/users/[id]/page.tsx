import StartMemberMimic from "@components/member-mimic/start";

export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
    const { id } = await params;
    const query = await searchParams;
    return (
        <StartMemberMimic
            userId={id}
            returnTo={
                typeof query.returnTo === "string" ? query.returnTo : undefined
            }
        />
    );
}
