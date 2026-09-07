import type { Model } from "mongoose";
import type {
    InternalMembership,
    InternalInvoice,
} from "@courselit/orm-models";
import RawMembership from "@/models/Membership";
import RawInvoice from "@/models/Invoice";
import RawPaymentPlan, { type InternalPaymentPlan } from "@/models/PaymentPlan";

// Reuse the native collections with explicit document types; no parallel billing copies.
export const MembershipModel = RawMembership as Model<InternalMembership>;
export const InvoiceModel = RawInvoice as Model<InternalInvoice>;
export const PaymentPlanModel = RawPaymentPlan as Model<InternalPaymentPlan>;
