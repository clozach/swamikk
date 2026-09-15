import { FetchBuilder } from "@courselit/utils";
import type { Address } from "@courselit/common-models";
import { responses } from "@config/strings";

/** What the server said to one permission change. */
export type PermissionSave =
    | { kind: "applied"; permissions: string[] }
    /** `updateUser` refuses: the site owner's account, or a rule the client did not know. */
    | { kind: "refused" }
    | { kind: "failed"; message: string };

const MUTATION = `
    mutation UpdateUserPermissions($id: ID!, $permissions: [String!]!) {
        user: updateUser(userData: { id: $id, permissions: $permissions }) {
            permissions
        }
    }
`;

/** One round trip; the server's list comes back as the truth. */
export async function savePermissions(
    address: Address,
    userId: string,
    permissions: string[],
): Promise<PermissionSave> {
    const request = new FetchBuilder()
        .setUrl(`${address.backend}/api/graph`)
        .setPayload({
            query: MUTATION,
            variables: { id: userId, permissions },
        })
        .setIsGraphQLEndpoint(true)
        .build();
    try {
        const response = await request.exec();
        const saved: unknown = response?.user?.permissions;
        if (Array.isArray(saved))
            return { kind: "applied", permissions: saved };
        return { kind: "failed", message: "" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === responses.action_not_allowed)
            return { kind: "refused" };
        return { kind: "failed", message };
    }
}

/** The one permission two sets disagree on (every save toggles exactly one). */
export function changedPermission(a: string[], b: string[]): string | null {
    const only = (x: string[], y: string[]) => x.filter((p) => !y.includes(p));
    return only(b, a)[0] ?? only(a, b)[0] ?? null;
}
