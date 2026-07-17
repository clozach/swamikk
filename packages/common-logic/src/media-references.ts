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
}

function getModel(name: string, schema: Schema): Model<any> {
    return (
        (mongoose.models[name] as Model<any> | undefined) ||
        mongoose.model(name, schema)
    );
}

function getReferenceSources(): ReferenceSource[] {
    return [
        { model: getModel("Domain", DomainSchema), domainField: "_id" },
        { model: getModel("Course", CourseSchema), domainField: "domain" },
        { model: getModel("Lesson", LessonSchema), domainField: "domain" },
        { model: getModel("Page", PageSchema), domainField: "domain" },
        { model: getModel("User", UserSchema), domainField: "domain" },
        {
            model: getModel("Community", CommunitySchema),
            domainField: "domain",
        },
        {
            model: getModel("CommunityPost", CommunityPostSchema),
            domainField: "domain",
        },
        {
            model: getModel("CommunityComment", CommunityCommentSchema),
            domainField: "domain",
        },
        {
            model: getModel("CertificateTemplate", CertificateTemplateSchema),
            domainField: "domain",
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
