import { userApiOpenApi } from "../app/api/user/openapi.mjs";
import { productsApiOpenApi } from "../app/api/products/openapi.mjs";
import { mediaApiOpenApi } from "../app/api/media/openapi.mjs";
import { feedbackApiOpenApi } from "../app/api/feedback/openapi.mjs";
import { contentChangesApiOpenApi } from "../app/api/content-changes/openapi.mjs";
import { memberMimicApiOpenApi } from "../app/api/member-mimic/openapi.mjs";
import { paymentWebhookOpenApi } from "../app/api/payment/webhook/openapi.mjs";

const routeSpecs = [
    userApiOpenApi,
    productsApiOpenApi,
    mediaApiOpenApi,
    feedbackApiOpenApi,
    contentChangesApiOpenApi,
    memberMimicApiOpenApi,
    paymentWebhookOpenApi,
];

function mergeOpenApiFragments(fragments) {
    return fragments.reduce(
        (acc, fragment) => ({
            tags: [...acc.tags, ...(fragment.tags ?? [])],
            paths: {
                ...acc.paths,
                ...(fragment.paths ?? {}),
            },
            components: {
                ...acc.components,
                ...(fragment.components ?? {}),
                parameters: {
                    ...(acc.components?.parameters ?? {}),
                    ...(fragment.components?.parameters ?? {}),
                },
                schemas: {
                    ...(acc.components?.schemas ?? {}),
                    ...(fragment.components?.schemas ?? {}),
                },
                securitySchemes: {
                    ...(acc.components?.securitySchemes ?? {}),
                    ...(fragment.components?.securitySchemes ?? {}),
                },
            },
        }),
        {
            tags: [],
            paths: {},
            components: {},
        },
    );
}

export function buildOpenApiRoutes() {
    return mergeOpenApiFragments(routeSpecs);
}
