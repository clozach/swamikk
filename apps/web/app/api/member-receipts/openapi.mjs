export default {
    "/api/member-receipts/{invoiceId}": {
        get: {
            summary:
                "Read a native payment receipt without changing payments or access",
            description:
                "Refund summaries report separately observed money status without altering original paid receipt amounts or access. Tenant and member ownership are checked through the native membership, including historical sessions. Member Mimic receives the approved subject's read-only view. No provider IDs, credentials, card data or external receipt URLs are exposed. A missing historical payment date stays unknown.",
            parameters: [
                {
                    name: "invoiceId",
                    in: "path",
                    required: true,
                    schema: {
                        type: "string",
                        pattern: "^[A-Za-z0-9_-]{1,128}$",
                    },
                },
            ],
            responses: {
                200: {
                    description:
                        "Native paid receipt with date provenance and test/live/unknown mode.",
                },
                401: { description: "Sign in required." },
                403: { description: "Expired Member Mimic." },
                404: { description: "Receipt unavailable to this member." },
            },
        },
    },
};
