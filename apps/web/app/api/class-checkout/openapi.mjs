const query = (name) => ({
    in: "query",
    name,
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 100 },
});
const choice = {
    type: "object",
    additionalProperties: false,
    required: ["cohortId", "fingerprint", "name", "startAt"],
    properties: {
        cohortId: { type: "string" },
        fingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" },
        name: { type: "string", maxLength: 180 },
        startAt: { type: "string", format: "date-time" },
    },
};
export const classCheckoutApiOpenApi = {
    tags: [
        {
            name: "Class checkout",
            description:
                "Opt-in dated class choices and owned checkout status. No roster data.",
        },
    ],
    paths: {
        "/api/class-checkout": {
            get: {
                tags: ["Class checkout"],
                operationId: "getClassCheckoutChoices",
                summary: "Read currently open public class dates",
                security: [],
                parameters: [query("courseId"), query("planId")],
                responses: {
                    200: {
                        description:
                            "No-store ordinary offer or bounded dated choices. An all-closed class offer returns an empty choices list.",
                        content: {
                            "application/json": {
                                schema: {
                                    oneOf: [
                                        {
                                            type: "object",
                                            required: ["kind"],
                                            properties: {
                                                kind: { enum: ["ordinary"] },
                                            },
                                        },
                                        {
                                            type: "object",
                                            required: ["kind", "choices"],
                                            properties: {
                                                kind: { enum: ["class"] },
                                                choices: {
                                                    type: "array",
                                                    maxItems: 100,
                                                    items: choice,
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                    400: { description: "Unknown or invalid query fields." },
                    404: { description: "Offer unavailable in this tenant." },
                    409: { description: "Listing needs human review." },
                },
            },
        },
        "/api/class-checkout/status": {
            get: {
                tags: ["Class checkout"],
                operationId: "getOwnClassCheckoutStatus",
                summary: "Read own saved booking attempt",
                security: [{ CourseLitSession: [] }],
                parameters: [query("courseId")],
                responses: {
                    200: {
                        description:
                            "No-store none, pending (reference), ready (reference, planId, opaque choice) paid-review (reference, frozen selectedStart and actual membership state), or completed (reference and frozen selectedStart). Never a checkout URL, roster or provider ID.",
                    },
                    400: { description: "Unknown or invalid query fields." },
                    401: {
                        description: "Current active member session required.",
                    },
                    403: { description: "Mimic cannot operate checkout." },
                    409: { description: "Account unavailable." },
                },
            },
        },
    },
};
