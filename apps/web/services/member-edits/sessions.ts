import mongoose from "mongoose";

/**
 * The member's sign-in sessions, deleted with the same statement account
 * erasure uses: the identity changed, so the next sign-in is with the new
 * address. Better Auth stores `userId` as the user's `_id` in either form.
 */
export async function revokeMemberSessions(
    domain: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
) {
    await mongoose.connection.collection("sessions").deleteMany({
        domain,
        userId: { $in: [userId, String(userId)] },
    });
}
