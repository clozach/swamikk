export default {
    "/api/member-billing": {
        get: {
            summary:
                "Read the signed-in member's billing and cancellation status",
            description:
                "Refund summaries report separately observed money status without altering original paid receipt amounts or access. Tenant-scoped, read-only billing projection. Member Mimic receives the subject's safe view. No provider credentials or identifiers, payment mutations or access initialization occur.",
            responses: {
                200: {
                    description:
                        "MemberBillingView: memberships, settled invoice summaries and cancellation/consequence state.",
                },
                401: { description: "Sign in required." },
                403: { description: "Expired Member Mimic." },
            },
        },
        post: {
            summary:
                "Prepare, confirm or reconcile the member's monthly cancellation",
            description:
                "Authenticated same-origin JSON only; Member Mimic writes rejected. Prepare stores an expiring provider quote without changing access. Confirm requires its exact operation ID/hash and records retention cutoff before cancellation. Reconcile preserves uncertain refund claims; it never blindly creates another refund.",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            oneOf: [
                                {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["action", "membershipId"],
                                    properties: {
                                        action: { const: "prepare" },
                                        membershipId: { type: "string" },
                                    },
                                },
                                {
                                    type: "object",
                                    additionalProperties: false,
                                    required: [
                                        "action",
                                        "operationId",
                                        "quoteHash",
                                    ],
                                    properties: {
                                        action: {
                                            enum: ["confirm", "reconcile"],
                                        },
                                        operationId: { type: "string" },
                                        quoteHash: {
                                            type: "string",
                                            pattern: "^[a-f0-9]{64}$",
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            responses: {
                200: {
                    description:
                        "MemberBillingCommandResult: persisted operation or explicit review/unavailable result.",
                },
                403: {
                    description:
                        "Cross-origin or Member Mimic mutation refused.",
                },
                404: {
                    description:
                        "Membership/operation is not owned by this member and tenant.",
                },
                409: {
                    description:
                        "Expired or changed review/session; refresh before retrying.",
                },
                503: {
                    description:
                        "Refresh persisted state before retrying after uncertainty.",
                },
            },
        },
    },
};
