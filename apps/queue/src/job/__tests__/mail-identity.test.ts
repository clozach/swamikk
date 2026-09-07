import router from "../routes";
import { addMailJob } from "../../domain/handler";
jest.mock("../../domain/handler", () => ({ addMailJob: jest.fn() }));
jest.mock("../../notifications/services/enqueue", () => ({
    addDispatchNotificationJob: jest.fn(),
    addNotificationJob: jest.fn(),
}));
jest.mock("../../logger", () => ({ logger: { error: jest.fn() } }));
jest.mock("../../observability/posthog", () => ({
    captureError: jest.fn(),
    getDomainId: (id?: string) => id || "system",
}));
const handler = router.stack.find((layer: any) => layer.route?.path === "/mail")
    .route.stack[0].handle;
const body = {
    to: ["member@example.com"],
    from: "school@example.com",
    subject: "Access",
    body: "Private",
    domainId: "forged",
    account: { userId: "member" },
};
function response() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    };
}
beforeEach(() => jest.clearAllMocks());
it("takes the member mail tenant from verified service identity", async () => {
    const res = response();
    await handler(
        { body, user: { domain: "signed-tenant", userId: "member" } },
        res,
    );
    expect(addMailJob).toHaveBeenCalledWith(
        expect.objectContaining({
            domainId: "signed-tenant",
            account: { userId: "member" },
        }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
});
it.each([undefined, { domain: "tenant", userId: "another-member" }])(
    "rejects member provenance without its matching verified identity (%p)",
    async (user) => {
        const res = response();
        await handler({ body, user }, res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "account_unavailable" }),
        );
        expect(addMailJob).not.toHaveBeenCalled();
    },
);
it("preserves sign-in mail without inferred member identity", async () => {
    const res = response();
    await handler(
        { body: { ...body, account: undefined }, user: undefined },
        res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(addMailJob).toHaveBeenCalledWith(
        expect.objectContaining({ account: undefined, domainId: "system" }),
    );
});
