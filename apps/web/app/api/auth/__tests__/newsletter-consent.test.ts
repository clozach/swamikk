const mockOptions: any[] = [];
let mockOtp: any;
jest.mock("better-auth", () => ({
    betterAuth: (options: any) => {
        mockOptions.push(options);
        return { api: {} };
    },
    APIError: class extends Error {},
    emailOTP: (options: any) => {
        mockOtp = options;
        return {};
    },
    customSession: () => ({}),
    sso: () => ({}),
}));
jest.mock("@/ba-multitenant-adapter", () => ({ mongodbAdapter: () => ({}) }));
jest.mock("@/services/queue", () => ({ addMailJob: jest.fn() }));
jest.mock("@/graphql/users/logic", () => ({ finalizeUserCreation: jest.fn() }));
jest.mock("@/app/actions", () => ({ getBackendAddress: jest.fn() }));
import { getAuth } from "@/auth";
import { addMailJob } from "@/services/queue";

it("does not opt an OTP-created account into marketing, even with a supplied true field", async () => {
    getAuth("https://consent.example");
    const config = mockOptions[mockOptions.length - 1];
    const result = await config.databaseHooks.user.create.before({
        email: "New@Example.com",
        subscribedToUpdates: true,
    });
    expect(result.data.subscribedToUpdates).toBe(false);
    expect(result.data.email).toBe("new@example.com");
    expect(result.data.active).toBe(true);
});
it("still queues a sign-in code independently of newsletter consent", async () => {
    await mockOtp.sendVerificationOTP(
        { email: "member@example.com", otp: "123456", type: "sign-in" },
        { headers: new Headers({ host: "school.example", domain: "school" }) },
    );
    expect(addMailJob).toHaveBeenCalledWith(
        expect.objectContaining({
            to: ["member@example.com"],
            subject: "Your sign-in code — school",
        }),
    );
});
