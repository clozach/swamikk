import { Help } from "@courselit/icons";
import Tooltip from "./tooltip";

export default function PageBuilderPropertyHeader({
    label,
    tooltip,
}: {
    label: string;
    tooltip?: string;
}) {
    const hasLabel = Boolean(label.trim());
    if (!hasLabel && !tooltip) return null;

    return (
        <div className="flex grow items-center gap-1">
            {hasLabel && <h2 className="mb-1 font-medium">{label}</h2>}
            {tooltip && (
                <Tooltip title={tooltip}>
                    <Help />
                </Tooltip>
            )}
        </div>
    );
}
