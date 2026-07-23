"use client";

import { Address, SocialFeedSourceKind } from "@courselit/common-models";
import { useToast } from "@courselit/components-library";
import { FetchBuilder } from "@courselit/utils";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useState } from "react";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@components/ui/input";
import { Switch } from "@components/ui/switch";
import { Button } from "@components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@components/ui/card";
import { Instagram, Facebook, ImagePlus, Save, Loader2 } from "lucide-react";
import {
    SOCIAL_HERO_ADD_FACEBOOK,
    SOCIAL_HERO_ADD_INSTAGRAM,
    SOCIAL_HERO_ADD_MANUAL,
    SOCIAL_HERO_CONFIG_CARD_HEADER,
    SOCIAL_HERO_ENABLED_HINT,
    SOCIAL_HERO_ENABLED_LABEL,
    SOCIAL_HERO_NO_SOURCES,
    SOCIAL_HERO_REFRESH_MINUTES_LABEL,
    SOCIAL_HERO_ROTATION_SECONDS_LABEL,
    SOCIAL_HERO_SAVE_SUCCESS,
    SOCIAL_HERO_SETTINGS_DESCRIPTION,
    SOCIAL_HERO_SETTINGS_HEADER,
    SOCIAL_HERO_SOURCES_HEADER,
    BUTTON_SAVE,
    TOAST_TITLE_ERROR,
    TOAST_TITLE_SUCCESS,
} from "@ui-config/strings";
import SourceCard from "./source-card";

export interface SocialHeroSourceFormValue {
    kind: SocialFeedSourceKind;
    id: string;
    label: string;
    imageUrl?: string;
    postUrl?: string;
    networkDomain?: string;
    alt?: string;
    igUserId?: string;
    pageId?: string;
    /** Always starts blank; blank on save = keep the stored token. */
    accessToken?: string;
    limit?: number;
    /** UI-only: whether a token is already stored server-side. */
    tokenStored?: boolean;
    /** UI-only: last-4 hint of the stored token. */
    tokenLast4?: string | null;
}

export interface SocialHeroFormValues {
    enabled: boolean;
    rotationSeconds: number;
    poolRefreshMinutes: number;
    sources: SocialHeroSourceFormValue[];
}

const sourceSchema = z
    .object({
        kind: z.enum(["manual", "instagram", "facebook"]),
        id: z.string(),
        label: z.string().min(1, "Required"),
        imageUrl: z.string().optional(),
        postUrl: z.string().optional(),
        networkDomain: z.string().optional(),
        alt: z.string().optional(),
        igUserId: z.string().optional(),
        pageId: z.string().optional(),
        accessToken: z.string().optional(),
        limit: z.coerce.number().optional(),
        tokenStored: z.boolean().optional(),
        tokenLast4: z.string().nullable().optional(),
    })
    .superRefine((s, ctx) => {
        const url = (v?: string) => !!v && /^https?:\/\//i.test(v);
        if (s.kind === "manual") {
            if (!url(s.imageUrl)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["imageUrl"],
                    message: "Enter a valid http(s) URL",
                });
            }
            if (!url(s.postUrl)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["postUrl"],
                    message: "Enter a valid http(s) URL",
                });
            }
            if (!s.networkDomain) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["networkDomain"],
                    message: "Required",
                });
            }
        } else {
            if (s.kind === "instagram" && !s.igUserId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["igUserId"],
                    message: "Required",
                });
            }
            if (s.kind === "facebook" && !s.pageId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["pageId"],
                    message: "Required",
                });
            }
            if (!s.tokenStored && !s.accessToken) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["accessToken"],
                    message: "A token is required",
                });
            }
            if (!s.limit || s.limit < 1) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["limit"],
                    message: "Must be at least 1",
                });
            }
        }
    });

const formSchema = z.object({
    enabled: z.boolean(),
    rotationSeconds: z.coerce.number().min(3).max(3600),
    poolRefreshMinutes: z.coerce.number().min(1).max(1440),
    sources: z.array(sourceSchema),
});

const POOL_QUERY_FIELDS = `
    enabled
    rotationSeconds
    poolRefreshMinutes
    sources {
        kind
        id
        label
        igUserId
        pageId
        limit
        hasAccessToken
        accessTokenLast4
        imageUrl
        postUrl
        networkDomain
        alt
    }
`;

interface MaskedSource {
    kind: SocialFeedSourceKind;
    id: string;
    label: string;
    igUserId?: string;
    pageId?: string;
    limit?: number;
    hasAccessToken?: boolean;
    accessTokenLast4?: string | null;
    imageUrl?: string;
    postUrl?: string;
    networkDomain?: string;
    alt?: string;
}

interface MaskedConfig {
    enabled: boolean;
    rotationSeconds: number;
    poolRefreshMinutes: number;
    sources: MaskedSource[];
}

const toFormValues = (config: MaskedConfig): SocialHeroFormValues => ({
    enabled: config.enabled,
    rotationSeconds: config.rotationSeconds,
    poolRefreshMinutes: config.poolRefreshMinutes,
    sources: config.sources.map((s) => ({
        kind: s.kind,
        id: s.id,
        label: s.label,
        imageUrl: s.imageUrl ?? "",
        postUrl: s.postUrl ?? "",
        networkDomain: s.networkDomain ?? "",
        alt: s.alt ?? "",
        igUserId: s.igUserId ?? "",
        pageId: s.pageId ?? "",
        accessToken: "",
        limit: s.limit ?? 10,
        tokenStored: !!s.hasAccessToken,
        tokenLast4: s.accessTokenLast4 ?? null,
    })),
});

interface SocialHeroSettingsProps {
    address: Address;
}

export default function SocialHeroSettings({
    address,
}: SocialHeroSettingsProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    const form = useForm<SocialHeroFormValues>({
        resolver: zodResolver(formSchema as any),
        defaultValues: {
            enabled: false,
            rotationSeconds: 60,
            poolRefreshMinutes: 60,
            sources: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "sources",
    });

    useEffect(() => {
        const load = async () => {
            const query = `query { config: getSocialHeroConfig { ${POOL_QUERY_FIELDS} } }`;
            const fetcher = new FetchBuilder()
                .setUrl(`${address.backend}/api/graph`)
                .setPayload({ query })
                .setIsGraphQLEndpoint(true)
                .build();
            try {
                const response = await fetcher.exec();
                if (response.config) {
                    form.reset(toFormValues(response.config));
                }
            } catch (err: any) {
                toast({
                    title: TOAST_TITLE_ERROR,
                    description: err.message,
                    variant: "destructive",
                });
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addSource = (kind: SocialFeedSourceKind) => {
        const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `src-${Date.now()}`;
        if (kind === "manual") {
            append({
                kind,
                id,
                label: "",
                imageUrl: "",
                postUrl: "",
                networkDomain: "",
                alt: "",
            });
        } else {
            append({
                kind,
                id,
                label: "",
                igUserId: "",
                pageId: "",
                accessToken: "",
                limit: 10,
                tokenStored: false,
                tokenLast4: null,
            });
        }
    };

    const onSubmit = async (values: SocialHeroFormValues) => {
        const sources = values.sources.map((s) => {
            if (s.kind === "manual") {
                return {
                    kind: "manual",
                    id: s.id,
                    label: s.label,
                    imageUrl: s.imageUrl,
                    postUrl: s.postUrl,
                    networkDomain: s.networkDomain,
                    alt: s.alt ?? "",
                };
            }
            const token =
                s.accessToken && s.accessToken.trim() !== ""
                    ? { accessToken: s.accessToken }
                    : {};
            return {
                kind: s.kind,
                id: s.id,
                label: s.label,
                limit: Number(s.limit),
                ...(s.kind === "instagram"
                    ? { igUserId: s.igUserId }
                    : { pageId: s.pageId }),
                ...token,
            };
        });
        const config = {
            enabled: values.enabled,
            rotationSeconds: Number(values.rotationSeconds),
            poolRefreshMinutes: Number(values.poolRefreshMinutes),
            sources,
        };
        const query = `mutation ($config: SocialHeroConfigInput!) { config: updateSocialHeroConfig(config: $config) { ${POOL_QUERY_FIELDS} } }`;
        const fetcher = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({ query, variables: { config } })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            setLoading(true);
            const response = await fetcher.exec();
            if (response.config) {
                form.reset(toFormValues(response.config));
                toast({
                    title: TOAST_TITLE_SUCCESS,
                    description: SOCIAL_HERO_SAVE_SUCCESS,
                });
            }
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h1 className="text-4xl font-semibold">
                    {SOCIAL_HERO_SETTINGS_HEADER}
                </h1>
                <p className="mt-1 text-muted-foreground">
                    {SOCIAL_HERO_SETTINGS_DESCRIPTION}
                </p>
            </div>

            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="flex flex-col gap-6"
                >
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {SOCIAL_HERO_CONFIG_CARD_HEADER}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <FormField
                                control={form.control}
                                name="enabled"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between gap-4">
                                        <div className="space-y-0.5">
                                            <FormLabel>
                                                {SOCIAL_HERO_ENABLED_LABEL}
                                            </FormLabel>
                                            <FormDescription>
                                                {SOCIAL_HERO_ENABLED_HINT}
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <div className="flex flex-col gap-4 sm:flex-row">
                                <FormField
                                    control={form.control}
                                    name="rotationSeconds"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <FormLabel>
                                                {
                                                    SOCIAL_HERO_ROTATION_SECONDS_LABEL
                                                }
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={3}
                                                    max={3600}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="poolRefreshMinutes"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <FormLabel>
                                                {
                                                    SOCIAL_HERO_REFRESH_MINUTES_LABEL
                                                }
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={1440}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{SOCIAL_HERO_SOURCES_HEADER}</CardTitle>
                            <CardDescription>
                                {fields.length === 0
                                    ? SOCIAL_HERO_NO_SOURCES
                                    : null}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            {fields.map((f, index) => (
                                <SourceCard
                                    key={f.id}
                                    control={form.control}
                                    index={index}
                                    onRemove={() => remove(index)}
                                />
                            ))}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => addSource("manual")}
                                >
                                    <ImagePlus className="mr-2 h-4 w-4" />
                                    {SOCIAL_HERO_ADD_MANUAL}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => addSource("instagram")}
                                >
                                    <Instagram className="mr-2 h-4 w-4" />
                                    {SOCIAL_HERO_ADD_INSTAGRAM}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => addSource("facebook")}
                                >
                                    <Facebook className="mr-2 h-4 w-4" />
                                    {SOCIAL_HERO_ADD_FACEBOOK}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div>
                        <Button type="submit" disabled={loading}>
                            {loading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            {BUTTON_SAVE}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
