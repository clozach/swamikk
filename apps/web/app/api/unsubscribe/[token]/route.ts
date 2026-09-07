import { NextRequest } from "next/server";
import { responses } from "@/config/strings";
import User from "@models/User";
import DomainModel from "@models/Domain";
import { setNewsletterConsent } from "@/services/newsletter/consent";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import { newsletterConfirmationResponse } from "@/services/newsletter/confirmation";
import { apiResponse } from "@/services/content-changes/http";

async function unsubscribe(req: NextRequest, token: string) {
    assertNoMemberMimicMutation(req.headers);
    const domain = await DomainModel.findOne({
        name: req.headers.get("domain"),
    });
    if (!domain) throw new Error("Site unavailable");
    const user =
        token && token.length <= 256
            ? await User.findOne({
                  domain: domain._id,
                  unsubscribeToken: token,
              })
            : null;
    if (user)
        await setNewsletterConsent(String(domain._id), user.userId, false);
    return { message: responses.unsubscribe_success };
}

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ token: string }> },
) {
    const response = await apiResponse(async () =>
        unsubscribe(req, (await context.params).token),
    );
    return newsletterConfirmationResponse(response.ok, response.status);
}

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ token: string }> },
) {
    return apiResponse(async () =>
        unsubscribe(req, (await context.params).token),
    );
}
