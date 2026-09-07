import { InvoiceSchema, InternalInvoice } from "@courselit/orm-models";
import mongoose from "mongoose";
export type { InternalInvoice };

export default mongoose.models.Invoice ||
    mongoose.model("Invoice", InvoiceSchema);
