import DomainModel from "@/models/Domain";
import type GQLContext from "@/models/GQLContext";
import { getTheme } from "@/graphql/themes/logic";
import { fingerprint, stableJson } from "@/services/content-changes/stable";

const plain = (value: unknown) =>
    value == null ? value : JSON.parse(JSON.stringify(value));
const fonts = (value: unknown) =>
    (plain(value) as Array<Record<string, unknown>> | undefined)?.map(
        ({ _id, ...font }) => font,
    );
const differs = (published: unknown, draft: unknown) =>
    draft !== undefined &&
    draft !== null &&
    stableJson(plain(published)) !== stableJson(plain(draft));
export async function readDraftPublicationContext(ctx: GQLContext) {
    const domain = await DomainModel.findById(ctx.subdomain._id);
    if (!domain) throw new Error("Site not found.");
    const theme = await getTheme({ ...ctx, subdomain: domain });
    const globalDrafts = {
        sharedWidgets: differs(domain.sharedWidgets, domain.draftSharedWidgets),
        typefaces: differs(
            fonts(domain.typefaces),
            fonts(domain.draftTypefaces),
        ),
        theme: differs(theme.theme, theme.draftTheme),
    };
    const published = {
        theme: {
            id: theme.themeId,
            name: theme.name,
            theme: plain(theme.theme),
        },
        typefaces: plain(domain.typefaces || []),
        sharedWidgets: plain(domain.sharedWidgets || {}),
    };
    return {
        ...published,
        globalDrafts,
        fingerprint: fingerprint({
            published,
            drafts: {
                sharedWidgets: plain(domain.draftSharedWidgets),
                typefaces: fonts(domain.draftTypefaces),
                theme: plain(theme.draftTheme),
            },
        }),
    };
}
/** First publication of a proposal-created page never promotes global drafts. */
export async function checkDraftPublication(ctx: GQLContext) {
    const { globalDrafts } = await readDraftPublicationContext(ctx);
    if (Object.values(globalDrafts).some(Boolean))
        throw new Error(
            "This page is still an unpublished draft. Shared header/footer, theme or font drafts are also pending. Review and resolve those site-wide drafts separately before publishing this page; creation approval did not approve them.",
        );
}
