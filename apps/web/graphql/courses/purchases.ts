/**
 * Business logic for a product's purchase records ("transactions").
 *
 * A single purchase in CourseLit is spread across three collections, joined by
 * the checkout session id:
 *
 *     activities.metadata.purchaseId  ===  invoices.membershipSessionId
 *     invoices.membershipId           ===  memberships.membershipId
 *
 *   - activities (type "purchased")  drives the Sales tile/chart (sums metadata.cost)
 *   - invoices                       the money record (carries the cs_test_/cs_live_ marker)
 *   - memberships                    the access grant
 *
 * The dashboard reassembles these into one row per purchase and can remove a
 * *test-mode* purchase (all three pieces) so testing cruft stops inflating sales.
 */
import GQLContext from "@/models/GQLContext";
import { Constants } from "@courselit/common-models";
import { responses } from "@/config/strings";
import InvoiceModel from "@models/Invoice";
import ActivityModel from "@models/Activity";
import MembershipModel from "@models/Membership";
import UserModel from "@/models/User";
import CourseModel from "@/models/Course";
import { checkIfAuthenticated } from "@/lib/graphql";
import { checkPermission } from "@courselit/utils";
import constants from "@/config/constants";
import { getCourseOrThrow } from "./logic";

const { permissions } = constants;

// Stripe Checkout Sessions created with a TEST key are prefixed `cs_test_`
// (live keys produce `cs_live_`). This is the authoritative "not a real sale"
// signal — it's set by Stripe, not by us, so it can't drift.
const TEST_SESSION_PREFIX = "cs_test_";

export interface ProductPurchase {
    purchaseId: string; // the checkout session id (invoice.membershipSessionId)
    invoiceId: string;
    userId: string | null;
    userEmail: string | null;
    userName: string | null;
    amount: number;
    currencyISOCode: string | null;
    status: string;
    isTest: boolean;
    createdAt: string | null; // ISO string; GraphQL layer types dates as strings
}

const isTestInvoice = (invoice: {
    paymentProcessorTransactionId?: string;
}): boolean =>
    typeof invoice.paymentProcessorTransactionId === "string" &&
    invoice.paymentProcessorTransactionId.startsWith(TEST_SESSION_PREFIX);

/**
 * List every purchase (invoiced sale) for a product, newest first. Gated on
 * the caller being able to manage this product (via getCourseOrThrow).
 */
export const getProductPurchases = async ({
    courseId,
    ctx,
}: {
    courseId: string;
    ctx: GQLContext;
}): Promise<ProductPurchase[]> => {
    const course = await getCourseOrThrow(undefined, ctx, courseId);

    const memberships = await MembershipModel.find({
        domain: ctx.subdomain._id,
        entityId: course.courseId,
        entityType: Constants.MembershipEntityType.COURSE,
    }).lean();

    const membershipIds = memberships.map((m: any) => m.membershipId);
    if (!membershipIds.length) {
        return [];
    }

    const invoices = await InvoiceModel.find({
        domain: ctx.subdomain._id,
        membershipId: { $in: membershipIds },
    }).lean();

    const buyerIds = Array.from(new Set(memberships.map((m: any) => m.userId)));
    const users = await UserModel.find({
        domain: ctx.subdomain._id,
        userId: { $in: buyerIds },
    })
        .select("userId email name")
        .lean();

    const userById = new Map(users.map((u: any) => [u.userId, u]));
    const membershipById = new Map(
        memberships.map((m: any) => [m.membershipId, m]),
    );

    return invoices
        .map((invoice: any): ProductPurchase => {
            const membership = membershipById.get(invoice.membershipId);
            const buyer = membership ? userById.get(membership.userId) : null;
            return {
                purchaseId: invoice.membershipSessionId,
                invoiceId: invoice.invoiceId,
                userId: membership ? membership.userId : null,
                userEmail: buyer ? buyer.email : null,
                userName: buyer ? buyer.name || null : null,
                amount: invoice.amount,
                currencyISOCode: invoice.currencyISOCode || null,
                status: invoice.status,
                isTest: isTestInvoice(invoice),
                createdAt: invoice.createdAt
                    ? new Date(invoice.createdAt).toISOString()
                    : null,
            };
        })
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
};

export interface ProductPurchaseWithProduct extends ProductPurchase {
    courseId: string;
    productTitle: string;
}

/**
 * List every purchase across every product the caller can manage (all
 * products for manageAnyCourse, own-authored products otherwise), newest
 * first. Powers the global Transactions page linked from the Overview Sales
 * chart, the multi-product counterpart to getProductPurchases above.
 */
export const getAllPurchases = async ({
    ctx,
}: {
    ctx: GQLContext;
}): Promise<ProductPurchaseWithProduct[]> => {
    checkIfAuthenticated(ctx);

    if (
        !checkPermission(ctx.user.permissions, [
            permissions.manageCourse,
            permissions.manageAnyCourse,
        ])
    ) {
        throw new Error(responses.action_not_allowed);
    }

    const courseQuery: Record<string, unknown> = {
        domain: ctx.subdomain._id,
    };
    if (!checkPermission(ctx.user.permissions, [permissions.manageAnyCourse])) {
        courseQuery.creatorId = ctx.user.userId;
    }

    const courses = await CourseModel.find(courseQuery)
        .select("courseId title")
        .lean();
    if (!courses.length) {
        return [];
    }
    const courseIds = courses.map((c: any) => c.courseId);
    const titleByCourseId = new Map(
        courses.map((c: any) => [c.courseId, c.title]),
    );

    const memberships = await MembershipModel.find({
        domain: ctx.subdomain._id,
        entityId: { $in: courseIds },
        entityType: Constants.MembershipEntityType.COURSE,
    }).lean();

    const membershipIds = memberships.map((m: any) => m.membershipId);
    if (!membershipIds.length) {
        return [];
    }

    const invoices = await InvoiceModel.find({
        domain: ctx.subdomain._id,
        membershipId: { $in: membershipIds },
    }).lean();

    const buyerIds = Array.from(new Set(memberships.map((m: any) => m.userId)));
    const users = await UserModel.find({
        domain: ctx.subdomain._id,
        userId: { $in: buyerIds },
    })
        .select("userId email name")
        .lean();

    const userById = new Map(users.map((u: any) => [u.userId, u]));
    const membershipById = new Map(
        memberships.map((m: any) => [m.membershipId, m]),
    );

    return invoices
        .map((invoice: any): ProductPurchaseWithProduct => {
            const membership = membershipById.get(invoice.membershipId);
            const buyer = membership ? userById.get(membership.userId) : null;
            const courseId = membership ? membership.entityId : "";
            return {
                purchaseId: invoice.membershipSessionId,
                invoiceId: invoice.invoiceId,
                userId: membership ? membership.userId : null,
                userEmail: buyer ? buyer.email : null,
                userName: buyer ? buyer.name || null : null,
                amount: invoice.amount,
                currencyISOCode: invoice.currencyISOCode || null,
                status: invoice.status,
                isTest: isTestInvoice(invoice),
                createdAt: invoice.createdAt
                    ? new Date(invoice.createdAt).toISOString()
                    : null,
                courseId,
                productTitle:
                    titleByCourseId.get(courseId) || "Unknown product",
            };
        })
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
};

/**
 * Remove a single TEST-mode purchase and all three of its scattered records
 * (activity + invoice + membership). By design this endpoint can ONLY delete
 * test-mode purchases: a live (cs_live_) financial record is not a representable
 * delete target here, so a real sale can never be destroyed through the UI.
 */
export const deleteTestPurchase = async ({
    courseId,
    purchaseId,
    ctx,
}: {
    courseId: string;
    purchaseId: string;
    ctx: GQLContext;
}): Promise<boolean> => {
    // Authorises the caller for THIS product (throws if not authenticated /
    // not a manager / product missing).
    await getCourseOrThrow(undefined, ctx, courseId);

    const invoice = await InvoiceModel.findOne({
        domain: ctx.subdomain._id,
        membershipSessionId: purchaseId,
    });
    if (!invoice) {
        throw new Error(responses.item_not_found);
    }

    // Safety gate: never delete a real (live) payment through this path.
    if (!isTestInvoice(invoice)) {
        throw new Error(responses.action_not_allowed);
    }

    const membership = await MembershipModel.findOne({
        domain: ctx.subdomain._id,
        membershipId: invoice.membershipId,
    });
    const purchasedActivity = await ActivityModel.findOne({
        domain: ctx.subdomain._id,
        type: "purchased",
        "metadata.purchaseId": purchaseId,
    });

    // Confirm this purchase actually belongs to the product the caller manages,
    // so a crafted purchaseId can't reach across products.
    const belongsToCourse =
        (membership && membership.entityId === courseId) ||
        (purchasedActivity && purchasedActivity.entityId === courseId);
    if (!belongsToCourse) {
        throw new Error(responses.item_not_found);
    }

    const buyerId =
        (membership && membership.userId) ||
        (purchasedActivity && purchasedActivity.userId) ||
        null;

    // Remove the buyer's whole footprint on this product so every tile clears
    // together — not just Sales (purchased) but Customers (enrolled), Downloads
    // and completion. Access (membership) and the money record (invoice) go too.
    // Scoped to (buyer, product): a purchase whose buyer we can't resolve falls
    // back to just its own purchased activity.
    await Promise.all([
        InvoiceModel.deleteOne({ _id: invoice._id }),
        membership ? MembershipModel.deleteOne({ _id: membership._id }) : null,
        buyerId
            ? ActivityModel.deleteMany({
                  domain: ctx.subdomain._id,
                  userId: buyerId,
                  entityId: courseId,
              })
            : purchasedActivity
              ? ActivityModel.deleteOne({ _id: purchasedActivity._id })
              : null,
    ]);

    return true;
};
