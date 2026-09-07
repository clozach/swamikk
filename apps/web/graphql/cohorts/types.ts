import {
    GraphQLFloat,
    GraphQLInputObjectType,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLString,
    GraphQLEnumType,
} from "graphql";

const toEpochMillis = (value?: Date | null) =>
    value ? new Date(value).getTime() : null;

const cohortSchedule = new GraphQLObjectType({
    name: "CohortSchedule",
    fields: {
        startAt: {
            type: GraphQLFloat,
            resolve: (schedule: { startAt?: Date; endAt?: Date }) =>
                toEpochMillis(schedule?.startAt),
        },
        endAt: {
            type: GraphQLFloat,
            resolve: (schedule: { startAt?: Date; endAt?: Date }) =>
                toEpochMillis(schedule?.endAt),
        },
    },
});

const cohortScheduleInput = new GraphQLInputObjectType({
    name: "CohortScheduleInput",
    fields: {
        startAt: { type: GraphQLFloat },
        endAt: { type: GraphQLFloat },
    },
});

const cohortType = new GraphQLObjectType<{
    checkoutState?: string;
    checkoutRevision?: number;
}>({
    name: "Cohort",
    fields: {
        cohortId: { type: new GraphQLNonNull(GraphQLString) },
        name: { type: new GraphQLNonNull(GraphQLString) },
        courseId: { type: new GraphQLNonNull(GraphQLString) },
        checkoutState: {
            type: GraphQLString,
            resolve: (cohort: { checkoutState?: string }) =>
                cohort.checkoutState || "private",
        },
        checkoutRevision: {
            type: GraphQLFloat,
            resolve: (cohort: { checkoutRevision?: number }) =>
                cohort.checkoutRevision || 0,
        },
        members: {
            type: new GraphQLNonNull(new GraphQLList(GraphQLString)),
        },
        schedule: { type: cohortSchedule },
        createdAt: { type: GraphQLString },
        updatedAt: { type: GraphQLString },
    },
});

const types = {
    checkoutState: new GraphQLEnumType({
        name: "CohortCheckoutState",
        values: {
            PRIVATE: { value: "private" },
            LISTED_CLOSED: { value: "listed-closed" },
            LISTED_OPEN: { value: "listed-open" },
        },
    }),
    cohortType,
    cohortSchedule,
    cohortScheduleInput,
};

export default types;
