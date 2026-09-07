import { GraphQLBoolean, GraphQLNonNull, GraphQLString } from "graphql";
import GQLContext from "../../models/GQLContext";
import {
    updatePage,
    createPage,
    deletePage,
    publish,
    deleteBlock,
} from "./logic";
import types from "./types";
import constants from "../../config/constants";
const { defaultPages } = constants;
import mediaTypes from "../media/types";
import { Media } from "@courselit/common-models";
const { mediaInputType } = mediaTypes;

const mutations = {
    updatePage: {
        type: types.page,
        args: {
            pageId: { type: new GraphQLNonNull(GraphQLString) },
            documentId: { type: GraphQLString },
            layout: { type: GraphQLString },
            title: { type: GraphQLString },
            description: { type: GraphQLString },
            socialImage: { type: mediaInputType },
            robotsAllowed: { type: GraphQLBoolean },
        },
        resolve: async (
            _: any,
            {
                pageId,
                documentId,
                layout,
                title,
                description,
                socialImage,
                robotsAllowed,
            }: {
                context: GQLContext;
                pageId: string;
                documentId?: string;
                layout?: string;
                title?: string;
                description?: string;
                socialImage?: Media | null;
                robotsAllowed?: boolean;
            },
            context: GQLContext,
        ) =>
            updatePage({
                context,
                pageId,
                documentId,
                layout,
                title,
                description,
                socialImage,
                robotsAllowed,
            }),
    },
    publish: {
        type: types.page,
        args: {
            pageId: { type: new GraphQLNonNull(GraphQLString) },
            documentId: { type: GraphQLString },
        },
        resolve: async (
            _: any,
            { pageId, documentId }: { pageId: string; documentId?: string },
            context: GQLContext,
        ) => publish(pageId, context, documentId),
    },
    createPage: {
        type: types.page,
        args: {
            name: {
                type: new GraphQLNonNull(GraphQLString),
            },
            pageId: {
                type: new GraphQLNonNull(GraphQLString),
            },
        },
        resolve: async (
            _: any,
            { name, pageId }: { name: string; pageId: string },
            context: GQLContext,
        ) => createPage({ context, name, pageId }),
    },
    deletePage: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
            id: {
                type: new GraphQLNonNull(GraphQLString),
            },
        },
        resolve: async (
            _: any,
            { id }: { id: (typeof defaultPages)[number] },
            context: GQLContext,
        ) => deletePage(context, id),
    },
    deleteBlock: {
        type: types.page,
        args: {
            pageId: { type: new GraphQLNonNull(GraphQLString) },
            documentId: { type: GraphQLString },
            blockId: { type: new GraphQLNonNull(GraphQLString) },
        },
        resolve: async (
            _: any,
            {
                pageId,
                blockId,
                documentId,
            }: { pageId: string; blockId: string; documentId?: string },
            context: GQLContext,
        ) => deleteBlock({ context, pageId, blockId, documentId }),
    },
};

export default mutations;
