import { ContactPreferencesModel } from "./model";

export async function deleteUserContactPreferences(
    domain: string,
    userId: string,
) {
    // Same-record fence: a save that already passed its User read must not
    // recreate erased contact/photo data while account deletion finishes.
    await ContactPreferencesModel.findOneAndUpdate(
        { domain, userId },
        {
            $set: { state: "deleted", updatedAt: new Date() },
            $inc: { revision: 1 },
            $unset: { contact: 1, checkIns: 1, photoVersion: 1, photoJpeg: 1 },
        },
        { upsert: true },
    );
}

/** Stop tenant requests before removing its private records. */
export async function deleteTenantContactPreferences(domain: string) {
    await ContactPreferencesModel.deleteMany({ domain });
}
