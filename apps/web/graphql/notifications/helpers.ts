import { COMMUNITIES_ENABLED } from "@config/release-features";
import {
    ActivityType,
    Constants,
    NotificationChannel,
} from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";

function isGeneralActivity(activityType: ActivityType): boolean {
    return getRequiredPermissionForActivity(activityType) === "";
}

function getRequiredPermissionForActivity(
    activityType: ActivityType,
): string | null {
    return Constants.ActivityPermissionMap[activityType] ?? null;
}

export function isActivityAllowedForPermissions(
    activityType: ActivityType,
    permissions: string[],
): boolean {
    if (!COMMUNITIES_ENABLED && activityType.startsWith("community_"))
        return false;
    if (isGeneralActivity(activityType)) {
        return true;
    }

    const requiredPermission = getRequiredPermissionForActivity(activityType);
    if (!requiredPermission) {
        return false;
    }

    return checkPermission(permissions, [requiredPermission]);
}

export function getAllowedActivityTypesForPermissions(
    permissions: string[],
): ActivityType[] {
    return (
        Object.values(Constants.ActivityType).filter((activityType) =>
            isActivityAllowedForPermissions(activityType, permissions),
        ) as ActivityType[]
    ).sort((a, b) => a.localeCompare(b));
}

function getDefaultChannelsForActivity(
    activityType: ActivityType,
): NotificationChannel[] {
    if (isGeneralActivity(activityType)) {
        return [
            Constants.NotificationChannel.APP,
            Constants.NotificationChannel.EMAIL,
        ];
    }

    return [];
}

export function getGeneralDefaultPreferences(): {
    activityType: ActivityType;
    channels: NotificationChannel[];
}[] {
    return (
        Object.values(Constants.ActivityType)
            .filter(
                (activityType) =>
                    isGeneralActivity(activityType) &&
                    isActivityAllowedForPermissions(activityType, []),
            )
            .sort((a, b) => a.localeCompare(b)) as ActivityType[]
    ).map((activityType) => ({
        activityType,
        channels: getDefaultChannelsForActivity(activityType),
    }));
}
