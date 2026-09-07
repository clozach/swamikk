export default {
    "/api/admin-overview": {
        get: {
            summary:
                "Read the native membership overview and support diagnostics",
            description:
                "Requires an active tenant administrator with manageSettings; Member Mimic, including expired cookies, is refused. Read-only business projection from existing records, with no grants, provider calls, mail or content writes. Native paid receipts are grouped by test/live/unknown mode and currency; amounts use major currency units. Original paid amounts remain separate from latest recorded successful refund evidence. Each source reports availability, selection limits and its latest recorded timestamp. Operational attention covers unresolved records independent of payment period; paid-without-active-access is explicitly an inference, not a grant instruction. No emails, message bodies, error bodies, provider IDs, tokens or payment details are returned. At most 500 selected records per source, 50 attention items and 25 current paid membership/product access checks. This is not a collector, heartbeat or complete health result. Responses are not cached; reads are limited to 30 per minute per tenant actor.",
            parameters: [
                {
                    name: "days",
                    in: "query",
                    schema: { type: "integer", enum: [7, 30], default: 7 },
                },
            ],
            responses: {
                200: {
                    description:
                        "Native snapshot with payment groups, membership/access record counts, attention, read coverage and freshness. Unavailable sources stay explicit, never inferred healthy.",
                },
                400: { description: "Unsupported payment period." },
                401: {
                    description: "The signed-in tenant account is unavailable.",
                },
                403: {
                    description:
                        "Site settings authority is missing or Member Mimic is present.",
                },
                404: { description: "Site not found." },
                429: { description: "Read rate limit reached." },
                503: {
                    description:
                        "Snapshot could not be read; no health conclusion.",
                },
            },
        },
    },
};
