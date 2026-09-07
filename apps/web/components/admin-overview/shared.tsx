import type { ReactNode } from "react";
import { useContext } from "react";
import { ProfileContext } from "@/components/contexts";
import { UIConstants } from "@courselit/common-models";

const p = UIConstants.permissions;
const routePermissions: Record<string, string[]> = {
    "/dashboard/users": [p.manageUsers],
    "/dashboard/transactions": [p.manageAnyCourse, p.manageCourse],
    "/dashboard/products": [p.manageAnyCourse, p.manageCourse],
    "/dashboard/changes": [p.manageSite, p.manageAnyCourse],
    "/dashboard/releases": [p.manageAnyCourse, p.manageCourse],
    "/dashboard/refund-review": [p.manageSettings],
};
export function OperationalLink({
    href,
    children,
}: {
    href: string;
    children: ReactNode;
}) {
    const { profile } = useContext(ProfileContext);
    if (
        routePermissions[href] &&
        !routePermissions[href].some((permission) =>
            profile?.permissions?.includes(permission),
        )
    )
        return null;
    return (
        <a className="underline underline-offset-4" href={href}>
            {children}
        </a>
    );
}
export function Timestamp({ at }: { at: string | null }) {
    return at ? (
        <time dateTime={at}>
            {new Date(at).toLocaleString(undefined, { timeZoneName: "short" })}
        </time>
    ) : (
        <>Not recorded</>
    );
}
export function money(amount: number, currency: string) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            currencyDisplay: "code",
        }).format(amount);
    } catch {
        return `${currency} ${amount.toLocaleString()}`;
    }
}
