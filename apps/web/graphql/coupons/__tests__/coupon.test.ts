import { UIConstants } from "@courselit/common-models";
import constants from "@/config/constants";
import { responses } from "@/config/strings";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";

// Stripe is mocked so no network call is made. The factory only references
// mock-prefixed variables (jest requirement); their closures run at test time,
// after these consts are initialized.
const mockCouponsCreate = jest.fn();
const mockCouponsList = jest.fn();
const mockCouponsDel = jest.fn();
const mockPromotionCodesCreate = jest.fn();
const mockPromotionCodesList = jest.fn();
const mockPromotionCodesUpdate = jest.fn();
const mockStripeConstructor = jest.fn().mockImplementation(() => ({
    coupons: {
        create: mockCouponsCreate,
        list: mockCouponsList,
        del: mockCouponsDel,
    },
    promotionCodes: {
        create: mockPromotionCodesCreate,
        list: mockPromotionCodesList,
        update: mockPromotionCodesUpdate,
    },
}));

jest.mock("stripe", () => ({
    __esModule: true,
    default: mockStripeConstructor,
}));

import {
    listCoupons,
    createCoupon,
    deleteCoupon,
    listPromotionCodes,
    createPromotionCode,
    deactivatePromotionCode,
    createFirstMonthFreeOffer,
} from "../logic";

const SUITE_PREFIX = `coupons-${Date.now()}`;
const id = (suffix: string) => `${SUITE_PREFIX}-${suffix}`;
const email = (suffix: string) => `${suffix}-${SUITE_PREFIX}@example.com`;

const STRIPE_SECRET = "sk_test_fake_secret_do_not_leak";

describe("Coupons", () => {
    let stripeDomain: any;
    let noStripeDomain: any;
    let adminUser: any;
    let regularUser: any;
    let mockCtx: any;
    let noStripeCtx: any;

    beforeAll(async () => {
        stripeDomain = await DomainModel.create({
            name: id("stripe-domain"),
            email: email("stripe-domain"),
            settings: {
                title: "Test school",
                currencyISOCode: "nzd",
                paymentMethod: UIConstants.PAYMENT_METHOD_STRIPE,
                stripeKey: "pk_test_fake",
                stripeSecret: STRIPE_SECRET,
            },
        });

        noStripeDomain = await DomainModel.create({
            name: id("no-stripe-domain"),
            email: email("no-stripe-domain"),
            settings: {
                title: "No payment school",
                paymentMethod: UIConstants.PAYMENT_METHOD_NONE,
            },
        });

        adminUser = await UserModel.create({
            domain: stripeDomain._id,
            userId: id("admin"),
            email: email("admin"),
            name: "Admin User",
            permissions: [constants.permissions.manageSettings],
            active: true,
            unsubscribeToken: id("unsubscribe-admin"),
            purchases: [],
        });

        regularUser = await UserModel.create({
            domain: stripeDomain._id,
            userId: id("regular"),
            email: email("regular"),
            name: "Regular User",
            permissions: [],
            active: true,
            unsubscribeToken: id("unsubscribe-regular"),
            purchases: [],
        });

        mockCtx = { user: adminUser, subdomain: stripeDomain } as any;
        noStripeCtx = { user: adminUser, subdomain: noStripeDomain } as any;
    });

    afterAll(async () => {
        await UserModel.deleteMany({ domain: stripeDomain._id });
        await DomainModel.deleteOne({ _id: stripeDomain._id });
        await DomainModel.deleteOne({ _id: noStripeDomain._id });
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("permission enforcement", () => {
        it("throws for an unauthenticated user", async () => {
            await expect(
                listCoupons({ subdomain: stripeDomain } as any),
            ).rejects.toThrow();
            expect(mockCouponsList).not.toHaveBeenCalled();
        });

        it("throws action_not_allowed for a user without manageSettings", async () => {
            await expect(
                createCoupon({ percentOff: 50, duration: "once" }, {
                    user: regularUser,
                    subdomain: stripeDomain,
                } as any),
            ).rejects.toThrow(responses.action_not_allowed);
            expect(mockCouponsCreate).not.toHaveBeenCalled();
        });
    });

    describe("stripe configuration guard", () => {
        it("throws stripe_not_configured when the domain is not on Stripe", async () => {
            await expect(listCoupons(noStripeCtx)).rejects.toThrow(
                responses.stripe_not_configured,
            );
            expect(mockCouponsList).not.toHaveBeenCalled();
        });

        it("constructs the Stripe client with the domain's secret", async () => {
            mockCouponsList.mockResolvedValue({ data: [] });
            mockPromotionCodesList.mockResolvedValue({ data: [] });

            await listCoupons(mockCtx);

            expect(mockStripeConstructor).toHaveBeenCalledWith(
                STRIPE_SECRET,
                expect.objectContaining({ typescript: true }),
            );
        });
    });

    describe("createCoupon", () => {
        it("creates a percentage coupon and never returns the secret", async () => {
            mockCouponsCreate.mockResolvedValue({
                id: "coupon_pct",
                name: "Launch",
                percent_off: 25,
                amount_off: null,
                currency: null,
                duration: "once",
                duration_in_months: null,
                times_redeemed: 0,
                valid: true,
                created: 1_700_000_000,
            });

            const result = await createCoupon(
                { name: "Launch", percentOff: 25, duration: "once" },
                mockCtx,
            );

            expect(mockCouponsCreate).toHaveBeenCalledWith({
                duration: "once",
                name: "Launch",
                percent_off: 25,
            });
            expect(result).toMatchObject({
                id: "coupon_pct",
                percentOff: 25,
                duration: "once",
            });
            expect(JSON.stringify(result)).not.toContain(STRIPE_SECRET);
        });

        it("defaults amount_off currency to the domain's currency", async () => {
            mockCouponsCreate.mockResolvedValue({
                id: "coupon_amt",
                amount_off: 1000,
                currency: "nzd",
                duration: "forever",
            });

            await createCoupon(
                { amountOff: 1000, duration: "forever" },
                mockCtx,
            );

            expect(mockCouponsCreate).toHaveBeenCalledWith({
                duration: "forever",
                amount_off: 1000,
                currency: "nzd",
            });
        });

        it("passes duration_in_months for a repeating coupon", async () => {
            mockCouponsCreate.mockResolvedValue({
                id: "coupon_rep",
                percent_off: 10,
                duration: "repeating",
                duration_in_months: 3,
            });

            await createCoupon(
                { percentOff: 10, duration: "repeating", durationInMonths: 3 },
                mockCtx,
            );

            expect(mockCouponsCreate).toHaveBeenCalledWith({
                duration: "repeating",
                percent_off: 10,
                duration_in_months: 3,
            });
        });

        it("rejects when both percentOff and amountOff are given", async () => {
            await expect(
                createCoupon(
                    { percentOff: 10, amountOff: 500, duration: "once" },
                    mockCtx,
                ),
            ).rejects.toThrow(responses.coupon_discount_invalid);
            expect(mockCouponsCreate).not.toHaveBeenCalled();
        });

        it("rejects when neither percentOff nor amountOff is given", async () => {
            await expect(
                createCoupon({ duration: "once" } as any, mockCtx),
            ).rejects.toThrow(responses.coupon_discount_invalid);
        });

        it("rejects an invalid duration", async () => {
            await expect(
                createCoupon({ percentOff: 10, duration: "yearly" }, mockCtx),
            ).rejects.toThrow(responses.coupon_duration_invalid);
        });

        it("rejects a repeating coupon without durationInMonths", async () => {
            await expect(
                createCoupon(
                    { percentOff: 10, duration: "repeating" },
                    mockCtx,
                ),
            ).rejects.toThrow(responses.coupon_duration_months_required);
        });
    });

    describe("listCoupons", () => {
        it("groups promotion codes under their coupon", async () => {
            mockCouponsList.mockResolvedValue({
                data: [
                    { id: "c1", percent_off: 100, duration: "once" },
                    {
                        id: "c2",
                        amount_off: 500,
                        currency: "nzd",
                        duration: "forever",
                    },
                ],
            });
            mockPromotionCodesList.mockResolvedValue({
                data: [
                    { id: "pc1", code: "FREE", active: true, coupon: "c1" },
                    { id: "pc2", code: "SAVE", active: false, coupon: "c2" },
                    {
                        id: "pc3",
                        code: "FREE2",
                        active: true,
                        coupon: { id: "c1" },
                    },
                ],
            });

            const result = await listCoupons(mockCtx);

            expect(result).toHaveLength(2);
            const c1 = result.find((c: any) => c.id === "c1");
            expect(c1).toBeDefined();
            expect(c1!.promotionCodes.map((p: any) => p.code)).toEqual([
                "FREE",
                "FREE2",
            ]);
            expect(JSON.stringify(result)).not.toContain(STRIPE_SECRET);
        });
    });

    describe("promotion codes", () => {
        it("creates a promotion code for a coupon", async () => {
            mockPromotionCodesCreate.mockResolvedValue({
                id: "pc_new",
                code: "WELCOME",
                active: true,
                coupon: "c1",
            });

            const result = await createPromotionCode(
                { couponId: "c1", code: "WELCOME" },
                mockCtx,
            );

            expect(mockPromotionCodesCreate).toHaveBeenCalledWith({
                coupon: "c1",
                code: "WELCOME",
            });
            expect(result).toMatchObject({ code: "WELCOME", active: true });
        });

        it("lists promotion codes filtered by coupon", async () => {
            mockPromotionCodesList.mockResolvedValue({
                data: [{ id: "pc1", code: "FREE", active: true, coupon: "c1" }],
            });

            await listPromotionCodes("c1", mockCtx);

            expect(mockPromotionCodesList).toHaveBeenCalledWith({
                limit: 100,
                coupon: "c1",
            });
        });

        it("deactivates a promotion code with active: false", async () => {
            mockPromotionCodesUpdate.mockResolvedValue({
                id: "pc1",
                code: "FREE",
                active: false,
                coupon: "c1",
            });

            const result = await deactivatePromotionCode("pc1", mockCtx);

            expect(mockPromotionCodesUpdate).toHaveBeenCalledWith("pc1", {
                active: false,
            });
            expect(result.active).toBe(false);
        });
    });

    describe("deleteCoupon", () => {
        it("returns true when Stripe reports the coupon deleted", async () => {
            mockCouponsDel.mockResolvedValue({ id: "c1", deleted: true });

            const result = await deleteCoupon("c1", mockCtx);

            expect(mockCouponsDel).toHaveBeenCalledWith("c1");
            expect(result).toBe(true);
        });
    });

    describe("createFirstMonthFreeOffer", () => {
        it("creates a 100%-off, once coupon plus a promotion code", async () => {
            mockCouponsCreate.mockResolvedValue({
                id: "coupon_fmf",
                name: "First month free",
                percent_off: 100,
                duration: "once",
            });
            mockPromotionCodesCreate.mockResolvedValue({
                id: "pc_fmf",
                code: "FIRSTFREE",
                active: true,
                coupon: "coupon_fmf",
            });

            const result = await createFirstMonthFreeOffer(
                { code: "FIRSTFREE" },
                mockCtx,
            );

            expect(mockCouponsCreate).toHaveBeenCalledWith({
                percent_off: 100,
                duration: "once",
                name: "First month free",
            });
            expect(mockPromotionCodesCreate).toHaveBeenCalledWith({
                coupon: "coupon_fmf",
                code: "FIRSTFREE",
            });
            expect(result.coupon).toMatchObject({
                percentOff: 100,
                duration: "once",
            });
            expect(result.promotionCode).toMatchObject({ code: "FIRSTFREE" });
        });
    });
});
