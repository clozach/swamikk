import type { DripChange, DripSectionView } from "@courselit/common-models";
import { dripAdminUi as copy } from "@/config/strings";

function messageState(section: DripSectionView): string {
    if (!section.notification) return copy.notificationUnprepared;
    return section.notification.enabled
        ? copy.notificationOn
        : copy.notificationOff;
}

export default function ReviewTable({
    preview,
    describeRule,
}: {
    preview: DripChange["preview"];
    describeRule: (rule: DripSectionView["rule"]) => string;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead>
                    <tr>
                        <th className="p-2">{copy.section}</th>
                        <th className="p-2">{copy.before}</th>
                        <th className="p-2">{copy.after}</th>
                    </tr>
                </thead>
                <tbody>
                    {preview.after.map((section, index) => {
                        const previousIndex = preview.before.findIndex(
                            (item) => item.id === section.id,
                        );
                        const previous = preview.before[previousIndex];
                        return (
                            <tr key={section.id} className="border-t">
                                <td className="p-2">
                                    {index + 1}. {section.name}
                                </td>
                                <td className="p-2">
                                    {describeRule(previous.rule)} (#
                                    {previousIndex + 1})
                                    <p className="mt-1">
                                        {messageState(previous)}
                                    </p>
                                </td>
                                <td className="p-2">
                                    {describeRule(section.rule)}
                                    <p className="mt-1">
                                        {messageState(section)}
                                    </p>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
