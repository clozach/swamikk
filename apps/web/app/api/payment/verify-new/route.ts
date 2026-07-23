import { NextRequest } from "next/server";
import { getDomain, getUser } from "../initiate/route";
import { auth } from "@/auth";
import { error } from "@/services/logger";
import InvoiceModel from "@models/Invoice";
import Membership from "@models/Membership";

interface RequestPayload {
    id: string;
}

export async function POST(req: NextRequest) {
    const body: RequestPayload = await req.json();
    const domainName = req.headers.get("domain");

    try {
        const domain = await getDomain(domainName);
        if (!domain) {
            return Response.json(
                { message: "Domain not found" },
                { status: 404 },
            );
        }

        const session = await auth.api.getSession({
            headers: req.headers,
        });
        const user = await getUser(session, domain._id);

        if (!user) {
            return Response.json({}, { status: 401 });
        }

        const { id } = body;

        if (!id) {
            return Response.json({ message: "Bad request" }, { status: 400 });
        }

        const invoice = await InvoiceModel.findOne({ invoiceId: id });

        if (!invoice) {
            return Response.json(
                { message: "Item not found" },
                { status: 404 },
            );
        }

        const membership = await Membership.findOne({
            membershipId: invoice.membershipId,
        });

        if (!membership || membership.userId !== user.userId) {
            return Response.json({}, { status: 401 });
        }

        // entityId (the purchased product's id) rides along so the verify page
        // can stamp WHICH product this paid page proves — the Journey Card's
        // purchase detector pins on it (see journey-card/journeys.ts). The
        // caller is the authenticated owner of this membership (checked above),
        // so this discloses nothing they don't already know.
        return Response.json({
            status: invoice.status,
            entityId: membership.entityId,
        });
    } catch (err: any) {
        error(`Error verifying invoice: ${err.message}`, {
            domain: domainName,
            body,
            stack: err.stack,
        });
        return Response.json({ message: err.message }, { status: 500 });
    }
}
