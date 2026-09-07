import {
    Kind,
    parse,
    print,
    type FieldNode,
    type SelectionSetNode,
} from "graphql";
import { requireCondition } from "@/services/content-changes/errors";

type FieldRules = { [field: string]: true | FieldRules };
const media: FieldRules = {
    mediaId: true,
    originalFileName: true,
    mimeType: true,
    size: true,
    access: true,
    file: true,
    thumbnail: true,
    caption: true,
};
const progress: FieldRules = {
    courseId: true,
    accessibleGroups: true,
    retainedLessonIds: true,
    completedLessons: true,
    certificateId: true,
    createdAt: true,
    lastDripAt: true,
};
const user: FieldRules = {
    id: true,
    userId: true,
    name: true,
    email: true,
    bio: true,
    avatar: media,
    permissions: true,
    purchases: progress,
    subscribedToUpdates: true,
    active: true,
};
const lesson: FieldRules = {
    id: true,
    lessonId: true,
    title: true,
    type: true,
    downloadable: true,
    requiresEnrollment: true,
    published: true,
    courseId: true,
    groupId: true,
    content: true,
    media,
    prevLesson: true,
    nextLesson: true,
};
const course: FieldRules = {
    courseId: true,
    title: true,
    description: true,
    featuredImage: media,
    updatedAt: true,
    creatorId: true,
    slug: true,
    cost: true,
    costType: true,
    type: true,
    isPreview: true,
    discussions: true,
    published: true,
    tags: true,
    firstLesson: true,
    leadMagnet: true,
    groups: {
        id: true,
        name: true,
        rank: true,
        collapsed: true,
        lessonsOrder: true,
        drip: {
            status: true,
            type: true,
            delayInMillis: true,
            dateInUTC: true,
        },
    },
    lessons: {
        lessonId: true,
        title: true,
        type: true,
        requiresEnrollment: true,
        published: true,
        courseId: true,
        groupId: true,
    },
    paymentPlans: {
        planId: true,
        name: true,
        type: true,
        oneTimeAmount: true,
        emiAmount: true,
        emiTotalInstallments: true,
        subscriptionMonthlyAmount: true,
        subscriptionYearlyAmount: true,
    },
    defaultPaymentPlan: true,
};
const roots: FieldRules = {
    getUser: user,
    getCourse: course,
    getLessonDetails: lesson,
    getUserContent: {
        entityType: true,
        entity: {
            id: true,
            title: true,
            slug: true,
            membersCount: true,
            totalLessons: true,
            completedLessonsCount: true,
            featuredImage: media,
            type: true,
            certificateId: true,
        },
    },
};

function validateSelections(
    set: SelectionSetNode,
    rules: FieldRules,
    budget: { remaining: number },
) {
    for (const selection of set.selections) {
        requireCondition(
            --budget.remaining >= 0 && selection.kind === Kind.FIELD,
            "mimic_read_only",
            "This query is not part of the Member Mimic view.",
            403,
        );
        const rule = rules[selection.name.value];
        requireCondition(
            rule,
            "mimic_private",
            "This information is private or outside Member Mimic.",
            403,
        );
        if (selection.selectionSet) {
            requireCondition(
                rule !== true,
                "mimic_read_only",
                "This query is not part of the Member Mimic view.",
                403,
            );
            validateSelections(selection.selectionSet, rule, budget);
        }
    }
}

/** No arbitrary queries, mutations, fragments, future email drafts or learner history. */
export function prepareMimicQuery(source: string): string {
    requireCondition(
        typeof source === "string" && source.length <= 64_000,
        "mimic_read_only",
        "This query is not part of the Member Mimic view.",
        403,
    );
    const document = parse(source);
    requireCondition(
        document.definitions.length === 1 &&
            document.definitions[0].kind === Kind.OPERATION_DEFINITION &&
            document.definitions[0].operation === "query",
        "mimic_read_only",
        "Exit Member Mimic before making changes.",
        403,
    );
    const operation = document.definitions[0];
    validateSelections(operation.selectionSet, roots, { remaining: 200 });
    const selections = operation.selectionSet.selections.map((selection) => {
        const field = selection as FieldNode;
        if (!["getCourse", "getLessonDetails"].includes(field.name.value))
            return field;
        const args = (field.arguments || []).filter(
            (argument) => !["preview", "asGuest"].includes(argument.name.value),
        );
        args.push({
            kind: Kind.ARGUMENT,
            name: { kind: Kind.NAME, value: "preview" },
            value: { kind: Kind.BOOLEAN, value: false },
        });
        if (field.name.value === "getCourse")
            args.push({
                kind: Kind.ARGUMENT,
                name: { kind: Kind.NAME, value: "asGuest" },
                value: { kind: Kind.BOOLEAN, value: true },
            });
        return { ...field, arguments: args };
    });
    // Replacing a preview variable makes its declaration unused; GraphQL rightly rejects
    // unused variables, so remove only declarations no longer present in this document.
    const updated = {
        ...document,
        definitions: [
            {
                ...operation,
                selectionSet: { ...operation.selectionSet, selections },
            },
        ],
    };
    const used = new Set<string>();
    const scan = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
            value.forEach(scan);
            return;
        }
        const item = value as Record<string, any>;
        if (item.kind === Kind.VARIABLE) used.add(item.name.value);
        Object.entries(item)
            .filter(([key]) => key !== "loc" && key !== "variableDefinitions")
            .forEach(([, child]) => scan(child));
    };
    scan(updated);
    updated.definitions[0].variableDefinitions = (
        operation.variableDefinitions || []
    ).filter((definition) => used.has(definition.variable.name.value));
    return print(updated);
}
