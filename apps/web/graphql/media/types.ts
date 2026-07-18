import {
    GraphQLString,
    GraphQLInt,
    GraphQLList,
    GraphQLObjectType,
    GraphQLInputObjectType,
} from "graphql";

const mediaType = new GraphQLObjectType({
    name: "Media",
    fields: {
        mediaId: { type: GraphQLString },
        originalFileName: { type: GraphQLString },
        mimeType: { type: GraphQLString },
        size: { type: GraphQLInt },
        access: { type: GraphQLString },
        file: { type: GraphQLString },
        thumbnail: { type: GraphQLString },
        caption: { type: GraphQLString },
    },
});

const mediaUsageType = new GraphQLObjectType({
    name: "MediaUsage",
    fields: {
        entityType: { type: GraphQLString },
        entityId: { type: GraphQLString },
        title: { type: GraphQLString },
    },
});

const mediaWithUsageType = new GraphQLObjectType({
    name: "MediaWithUsage",
    fields: {
        mediaId: { type: GraphQLString },
        originalFileName: { type: GraphQLString },
        mimeType: { type: GraphQLString },
        size: { type: GraphQLInt },
        access: { type: GraphQLString },
        thumbnail: { type: GraphQLString },
        usage: { type: new GraphQLList(mediaUsageType) },
    },
});

const mediaInputType = new GraphQLInputObjectType({
    name: "MediaInput",
    fields: {
        mediaId: { type: GraphQLString },
        originalFileName: { type: GraphQLString },
        mimeType: { type: GraphQLString },
        size: { type: GraphQLInt },
        access: { type: GraphQLString },
        file: { type: GraphQLString },
        thumbnail: { type: GraphQLString },
        caption: { type: GraphQLString },
    },
});

export default {
    mediaType,
    mediaInputType,
    mediaUsageType,
    mediaWithUsageType,
};
