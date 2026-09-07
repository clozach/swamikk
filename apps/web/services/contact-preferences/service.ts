import type { ContactPreferences } from "@courselit/common-models";
import type { InternalContactPreferences } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import UserModel from "@/models/User";
import { requireCondition } from "@/services/content-changes/errors";
import { ContactPreferencesModel } from "./model";
import { contactPreferencesSchema } from "./validation";
import { privatePhotoJpeg } from "./photo";

export async function preferenceOwner(ctx: GQLContext) {
    requireCondition(
        ctx.user && String(ctx.user.domain) === String(ctx.subdomain._id),
        "forbidden",
        "Sign in to view contact preferences.",
        403,
    );
    const user = await UserModel.findOne({
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        active: true,
    });
    requireCondition(user, "forbidden", "This account is unavailable.", 403);
    return user;
}

function view(
    record: InternalContactPreferences | null,
    email: string,
): ContactPreferences {
    return {
        revision: record?.revision || 0,
        contact: record?.contact || { kind: "email", value: email },
        checkIns: record?.checkIns || "none",
        photo: record?.photoVersion
            ? { kind: "shared", version: record.photoVersion }
            : { kind: "none" },
    };
}

export async function readContactPreferences(
    ctx: GQLContext,
): Promise<ContactPreferences> {
    const user = await preferenceOwner(ctx);
    const record = await ContactPreferencesModel.findOne({
        domain: ctx.subdomain._id,
        userId: user.userId,
    });
    requireCondition(
        !record || record.state === "active",
        "forbidden",
        "This account is being removed.",
        403,
    );
    return view(record, user.email);
}

export async function saveContactPreferences(
    raw: unknown,
    ctx: GQLContext,
): Promise<ContactPreferences> {
    requireCondition(
        !ctx.memberMimic,
        "mimic_read_only",
        "Exit Member Mimic before changing preferences.",
        403,
    );
    const user = await preferenceOwner(ctx);
    const input = contactPreferencesSchema.parse(raw);
    const photo =
        input.photo.kind === "replace"
            ? await privatePhotoJpeg(input.photo.data)
            : undefined;
    // One revision controls text and photo together. Stale tabs cannot restore a removed photo.
    const update = {
        $set: {
            contact: input.contact,
            checkIns: input.checkIns,
            updatedAt: new Date(),
            ...(photo
                ? { photoJpeg: photo, photoVersion: input.revision + 1 }
                : {}),
        },
        $inc: { revision: 1 },
        ...(input.photo.kind === "remove"
            ? { $unset: { photoJpeg: 1, photoVersion: 1 } }
            : {}),
    };
    let record;
    try {
        record = await ContactPreferencesModel.findOneAndUpdate(
            {
                domain: ctx.subdomain._id,
                userId: user.userId,
                revision: input.revision,
                state: "active",
            },
            update,
            { new: true, upsert: input.revision === 0, runValidators: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
    }
    requireCondition(
        record,
        "conflict",
        "Your preferences changed in another window. Reload them before saving.",
        409,
    );
    return view(record, user.email);
}

export async function readContactPhoto(ctx: GQLContext): Promise<Buffer> {
    const user = await preferenceOwner(ctx);
    const record = await ContactPreferencesModel.findOne({
        domain: ctx.subdomain._id,
        userId: user.userId,
    }).select("+photoJpeg");
    requireCondition(
        record?.photoVersion && record.photoJpeg,
        "not_found",
        "No private photo is shared.",
        404,
    );
    return Buffer.from(Array.from(record.photoJpeg as ArrayLike<number>));
}
