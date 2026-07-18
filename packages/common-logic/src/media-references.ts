import mongoose, { Model, Schema } from "mongoose";
import {
    CertificateTemplateSchema,
    CommunityCommentSchema,
    CommunityPostSchema,
    CommunitySchema,
    CourseSchema,
    DomainSchema,
    LessonSchema,
    PageSchema,
    UserSchema,
} from "@courselit/orm-models";
import { extractMediaIDs } from "@courselit/utils";

interface ReferenceSource {
    model: Model<any>;
    domainField: "_id" | "domain";
    // Human-facing attribution, used by collectMediaUsage. The GC's
    // collectReferencedMediaIds ignores these fields.
    entityType: string;
    // Field carrying the stable public id; falls back to _id when absent.
    idField: string;
    // Field to show as the entity's name in the media library.
    labelField: string;
}

function getModel(name: string, schema: Schema): Model<any> {
    return (
        (mongoose.models[name] as Model<any> | undefined) ||
        mongoose.model(name, schema)
    );
}

function getReferenceSources(): ReferenceSource[] {
    return [
        {
            model: getModel("Domain", DomainSchema),
            domainField: "_id",
            entityType: "domain",
            idField: "name",
            labelField: "name",
        },
        {
            model: getModel("Course", CourseSchema),
            domainField: "domain",
            entityType: "course",
            idField: "courseId",
            labelField: "title",
        },
        {
            model: getModel("Lesson", LessonSchema),
            domainField: "domain",
            entityType: "lesson",
            idField: "lessonId",
            labelField: "title",
        },
        {
            model: getModel("Page", PageSchema),
            domainField: "domain",
            entityType: "page",
            idField: "pageId",
            labelField: "name",
        },
        {
            model: getModel("User", UserSchema),
            domainField: "domain",
            entityType: "user",
            idField: "userId",
            labelField: "email",
        },
        {
            model: getModel("Community", CommunitySchema),
            domainField: "domain",
            entityType: "community",
            idField: "communityId",
            labelField: "name",
        },
        {
            model: getModel("CommunityPost", CommunityPostSchema),
            domainField: "domain",
            entityType: "communityPost",
            idField: "postId",
            labelField: "title",
        },
        {
            model: getModel("CommunityComment", CommunityCommentSchema),
            domainField: "domain",
            entityType: "communityComment",
            idField: "commentId",
            labelField: "communityId",
        },
        {
            model: getModel("CertificateTemplate", CertificateTemplateSchema),
            domainField: "domain",
            entityType: "certificateTemplate",
            idField: "templateId",
            labelField: "title",
        },
    ];
}

export function collectMediaIdsFromValue(
    value: unknown,
    result: Set<string> = new Set<string>(),
): Set<string> {
    if (typeof value === "string") {
        for (const mediaId of extractMediaIDs(value)) {
            result.add(mediaId);
        }

        if (
            value.includes("mediaId") &&
            (value.startsWith("{") || value.startsWith("["))
        ) {
            try {
                collectMediaIdsFromValue(JSON.parse(value), result);
            } catch {
                // A normal string containing the word mediaId needs no parsing.
            }
        }
        return result;
    }

    if (!value || typeof value !== "object") {
        return result;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectMediaIdsFromValue(item, result);
        }
        return result;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.mediaId === "string" && record.mediaId) {
        result.add(record.mediaId);
    }
    for (const nested of Object.values(record)) {
        collectMediaIdsFromValue(nested, result);
    }
    return result;
}

export async function collectReferencedMediaIds(
    domain: mongoose.Types.ObjectId | string,
): Promise<Set<string>> {
    const result = new Set<string>();

    for (const source of getReferenceSources()) {
        const cursor = source.model
            .find({ [source.domainField]: domain })
            .lean()
            .cursor();
        for await (const document of cursor) {
            collectMediaIdsFromValue(document, result);
        }
    }

    return result;
}

export interface MediaUsageEntry {
    entityType: string;
    entityId: string;
    title: string;
}

/**
 * Like collectReferencedMediaIds, but keeps attribution: returns, per
 * referenced mediaId, the entities that reference it. Powers the dashboard
 * media library's "used in" column. Same scan surface as the media GC, so a
 * media object is "unreferenced" here exactly when the GC considers it
 * collectable.
 */
export async function collectMediaUsage(
    domain: mongoose.Types.ObjectId | string,
): Promise<Map<string, MediaUsageEntry[]>> {
    const usage = new Map<string, MediaUsageEntry[]>();

    for (const source of getReferenceSources()) {
        const cursor = source.model
            .find({ [source.domainField]: domain })
            .lean()
            .cursor();
        for await (const document of cursor) {
            const mediaIds = collectMediaIdsFromValue(document);
            if (!mediaIds.size) {
                continue;
            }
            const entry: MediaUsageEntry = {
                entityType: source.entityType,
                entityId: String(
                    document[source.idField] ?? document._id ?? "",
                ),
                title: String(document[source.labelField] ?? ""),
            };
            for (const mediaId of mediaIds) {
                const existing = usage.get(mediaId);
                if (existing) {
                    existing.push(entry);
                } else {
                    usage.set(mediaId, [entry]);
                }
            }
        }
    }

    return usage;
}
