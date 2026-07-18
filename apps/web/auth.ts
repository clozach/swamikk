import { APIError, betterAuth } from "better-auth";
import { customSession, emailOTP } from "better-auth/plugins";
import { MongoClient } from "mongodb";
import { InternalUser } from "@courselit/orm-models";
import { generateUniqueId, getEmailFrom } from "@courselit/utils";
import { addMailJob } from "@/services/queue";
import pug from "pug";
import MagicCodeEmailTemplate from "@/templates/magic-code-email";
import { mongodbAdapter } from "@/ba-multitenant-adapter";
import { getBackendAddress } from "./app/actions";
import { sso } from "@better-auth/sso";
import constants from "@/config/constants";
import { finalizeUserCreation } from "./graphql/users/logic";
import { sanitizeEmail } from "./lib/sanitize-email";
import DomainModel, { Domain } from "@models/Domain";
import UserModel from "@models/User";
import { als } from "./async-local-storage";

const client = new MongoClient(
    process.env.DB_CONNECTION_STRING || "mongodb://localhost:27017",
);
const db = client.db();

const toDomainId = (value: unknown) => {
    if (typeof value === "string" && value) {
        return value;
    }

    if (
        value &&
        typeof value === "object" &&
        "toString" in value &&
        typeof value.toString === "function"
    ) {
        const serialized = value.toString();
        return serialized ? serialized : undefined;
    }

    return undefined;
};

const getAuthDomain = async ({
    user,
    ctx,
}: {
    user?: Record<string, unknown>;
    ctx?: { headers?: Headers };
}): Promise<Domain> => {
    const domainId =
        toDomainId(user?.domain) ||
        ctx?.headers?.get("domainId") ||
        als.getStore()?.get("domainId");
    const domainName =
        ctx?.headers?.get("domain") || als.getStore()?.get("domain");

    const domain = (domainId
        ? await DomainModel.findById(domainId).lean()
        : await DomainModel.findOne<Domain>({
              name: domainName,
          }).lean()) as unknown as Domain;

    if (!domain) {
        throw new APIError("NOT_FOUND", {
            message: "Domain not found",
        });
    }

    return domain;
};

const getSessionUserId = async (
    user: Partial<InternalUser> & { id?: string },
) => {
    if (user.userId) {
        return user.userId;
    }

    if (!user.id) {
        return undefined;
    }

    const authUser = await UserModel.findOne({ _id: user.id })
        .select("userId")
        .lean();

    return (authUser as { userId?: string } | null)?.userId;
};

const getSessionConfig = () => {
    if (process.env.SESSION_COOKIE_CACHE_MAX_AGE) {
        const configuredMaxAge = parseInt(
            process.env.SESSION_COOKIE_CACHE_MAX_AGE,
        );

        if (configuredMaxAge > 0) {
            return {
                cookieCache: {
                    enabled: true,
                    maxAge: configuredMaxAge * 60,
                },
            };
        }
    }

    return {
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60, // 5 minutes
        },
    };
};

const createAuthConfig = (baseURL = ""): any => ({
    appName: "CourseLit",
    secret: process.env.AUTH_SECRET,
    ...(baseURL ? { baseURL } : {}),
    user: {
        additionalFields: {
            userId: {
                type: "string",
                required: false,
            },
            active: {
                type: "boolean",
                required: false,
            },
            purchases: {
                type: "json",
                required: false,
            },
            permissions: {
                type: "string[]",
                required: false,
            },
            lead: {
                type: "string",
                required: false,
            },
            subscribedToUpdates: {
                type: "boolean",
                required: false,
            },
            tags: {
                type: "string[]",
                required: false,
            },
            unsubscribeToken: {
                type: "string",
                required: false,
            },
        },
    },
    account: {
        storeStateStrategy: "cookie",
        accountLinking: {
            enabled: true,
            trustedProviders: ["sso", "google"],
        },
    },
    advanced: {
        cookiePrefix: "courselit",
        cookies: {
            relay_state: {
                attributes: {
                    sameSite: "none",
                    secure: true,
                },
            },
        },
    },
    database: mongodbAdapter(db, {
        client,
        usePlural: true,
        // Enable transactions by default; set DB_TRANSACTIONS=false to opt out.
        transaction:
            process.env.DB_TRANSACTIONS === undefined
                ? true
                : process.env.DB_TRANSACTIONS.toLowerCase() !== "false",
    }),
    plugins: [
        emailOTP({
            overrideDefaultEmailVerification: true,
            storeOTP: "hashed",
            async sendVerificationOTP({ email, otp, type }, ctx) {
                // The email is branded as the school itself, so it needs an
                // absolute logo URL — mail clients won't resolve a relative
                // path. proxy.ts sets x-forwarded-proto on every request;
                // fall back to http for the local rig, which has no TLS.
                const host = ctx!.headers?.get("host");
                const proto = ctx!.headers?.get("x-forwarded-proto") || "http";
                const schoolName =
                    ctx!.headers?.get("domaintitle") ||
                    ctx!.headers?.get("domain") ||
                    "";

                // One code serves three different moments, and telling a
                // member "sign in" while they're confirming a new address is
                // the kind of small wrongness that erodes trust in the rest
                // of it. better-auth gives us the type; use it.
                const copy = {
                    "sign-in": {
                        heading: "Your sign-in code",
                        intro: `Welcome back — here is the code to sign in to ${schoolName}. It stays valid for five minutes.`,
                    },
                    "email-verification": {
                        heading: "Confirm your email",
                        intro: `Nearly there — enter this code to confirm your email address with ${schoolName}. It stays valid for five minutes.`,
                    },
                    "forget-password": {
                        heading: "Reset your password",
                        intro: `Use this code to set a new password for ${schoolName}. It stays valid for five minutes.`,
                    },
                }[type as string] ?? {
                    heading: "Your code",
                    intro: `Here is your code for ${schoolName}. It stays valid for five minutes.`,
                };

                const emailBody = pug.render(MagicCodeEmailTemplate, {
                    code: otp,
                    schoolName,
                    heading: copy.heading,
                    intro: copy.intro,
                    // Served from apps/web/public, so both are baked into the
                    // image rather than depending on a bind mount.
                    logoUrl: host ? `${proto}://${host}/swami-kk-logo.png` : "",
                    signatureUrl: host
                        ? `${proto}://${host}/swami-signature.png`
                        : "",
                });

                await addMailJob({
                    to: [email],
                    // Was `${responses.sign_in_mail_prefix} ${host}`, which
                    // put a bare hostname in front of the member ("Sign in to
                    // localhost:3001"). The school's name is what they
                    // recognise in a crowded inbox, and the heading already
                    // says which of the three moments this is.
                    subject: schoolName
                        ? `${copy.heading} — ${schoolName}`
                        : copy.heading,
                    body: emailBody,
                    from: getEmailFrom({
                        name:
                            ctx!.headers?.get("domaintitle") ||
                            ctx!.headers?.get("domain") ||
                            "",
                        email: process.env.EMAIL_FROM || "",
                    }),
                });
            },
        }),
        customSession(async ({ user, session }, ctx) => {
            return {
                user: {
                    ...user,
                    userId: await getSessionUserId(
                        user as Partial<InternalUser> & { id?: string },
                    ),
                },
                session: {
                    ...session,
                    domainId: ctx.headers?.get("domainId"),
                },
            };
        }),
        sso({
            saml: {
                enableInResponseToValidation: true,
                requestTTL: 10 * 60 * 1000, // 10 minutes
                clockSkew: 5 * 60 * 1000, // 5 minutes
                requireTimestamps: true,
            },
            fields: {
                domain: "domain_string",
            },
        }),
    ],
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    return {
                        data: {
                            email: sanitizeEmail(user.email),
                            active: true,
                            userId: generateUniqueId(),
                            purchases: [],
                            permissions: [
                                constants.permissions.enrollInCourse,
                                constants.permissions.manageMedia,
                            ],
                            lead: constants.leadWebsite,
                            subscribedToUpdates: true,
                            tags: [],
                            unsubscribeToken: generateUniqueId(),
                        },
                    };
                },
                after: async (user, ctx) => {
                    const domain = await getAuthDomain({
                        user: user as Record<string, unknown>,
                        ctx,
                    });
                    await finalizeUserCreation(
                        user as InternalUser,
                        domain._id.toString(),
                    );
                },
            },
        },
    },
    trustedOrigins: async (request?: Request) => {
        // Better Auth may invoke this during initialization/auth.api calls without a request.
        if (!request) {
            return [];
        }

        const origins: string[] = [
            await getBackendAddress(request.headers),
            "https://accounts.google.com",
            "https://oauth2.googleapis.com",
            "https://openidconnect.googleapis.com",
            "https://www.googleapis.com",
        ];
        if (request.headers.get("ssotrusteddomain")) {
            origins.push(request.headers.get("ssotrusteddomain")!);
        }
        return origins;
    },
    session: getSessionConfig(),
});

const authInstances = new Map<string, ReturnType<typeof betterAuth>>();

export const getAuth = (baseURL = "") => {
    if (!authInstances.has(baseURL)) {
        authInstances.set(baseURL, betterAuth(createAuthConfig(baseURL)));
    }

    return authInstances.get(baseURL)!;
};

export const auth = getAuth();
