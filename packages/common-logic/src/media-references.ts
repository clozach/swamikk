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
    // Dashboard deep-link to the referencing entity, or undefined when the
    // type has no dashboard page (or a required id is missing). Lets the media
    // library turn each attribution into a click-through to its source.
    href?: string;
}

/**
 * Dashboard deep-link for a referencing entity. Route knowledge lives here,
 * beside the id/label fields, so "how do I point at this entity" is defined
 * once per entity type. Returns undefined when the type has no dashboard page
 * or a required id is missing — a missing link beats a `/undefined` one.
 *
 * The entityType strings must match those in getReferenceSources.
 */
export function usageHref(
    entityType: string,
    doc: Record<string, any>,
): string | undefined {
    const seg = (v: unknown): string | undefined => (v ? String(v) : undefined);
    switch (entityType) {
        case "course": {
            const id = seg(doc.courseId);
            return id ? `/dashboard/product/${id}` : undefined;
        }
        case "lesson": {
            const c = seg(doc.courseId);
            const g = seg(doc.groupId);
            const l = seg(doc.lessonId);
            return c && g && l
                ? `/dashboard/product/${c}/content/section/${g}/lesson?id=${l}`
                : undefined;
        }
        case "page": {
            const id = seg(doc.pageId);
            return id ? `/dashboard/page/${id}` : undefined;
        }
        case "user": {
            const id = seg(doc.userId);
            return id ? `/dashboard/users/${id}` : undefined;
        }
        case "community": {
            const id = seg(doc.communityId);
            return id ? `/dashboard/community/${id}` : undefined;
        }
        // A comment has no page of its own; point at the post that holds it.
        case "communityPost":
        case "communityComment": {
            const c = seg(doc.communityId);
            const p = seg(doc.postId);
            return c && p ? `/dashboard/community/${c}/${p}` : undefined;
        }
        // domain, certificateTemplate: no dashboard page to link to.
        default:
            return undefined;
    }
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
                href: usageHref(source.entityType, document),
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
