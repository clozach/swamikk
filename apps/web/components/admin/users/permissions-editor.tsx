import { Checkbox } from "@components/ui/checkbox";
import permissionToCaptionMap from "./permissions-to-caption-map";

interface PermissionsEditorProps {
    /** The account's current permission ids (the server's list, not a draft). */
    permissions: string[];
    /** True while no box may be changed (own account, protected account). */
    disabled?: boolean;
    /** The permission whose save is in flight; its box waits, the rest stay live. */
    pending?: string | null;
    onToggle: (permission: string, value: boolean) => void;
}

/** The nine boxes. Presentational: saving, undo and refusal live in the magnet. */
export default function PermissionsEditor({
    permissions,
    disabled = false,
    pending = null,
    onToggle,
}: PermissionsEditorProps) {
    return (
        <ul className="kk-permissions-list" data-kk-permissions-list>
            {Object.keys(permissionToCaptionMap).map((permission) => {
                const id = `kk-permission-${permission.replace(/[^a-z]/gi, "-")}`;
                return (
                    <li key={permission}>
                        <label htmlFor={id}>
                            {permissionToCaptionMap[permission]}
                        </label>
                        <Checkbox
                            id={id}
                            aria-label={permissionToCaptionMap[permission]}
                            disabled={disabled || pending !== null}
                            aria-busy={pending === permission || undefined}
                            checked={permissions.includes(permission)}
                            onCheckedChange={(value) =>
                                onToggle(permission, value === true)
                            }
                        />
                    </li>
                );
            })}
        </ul>
    );
}
