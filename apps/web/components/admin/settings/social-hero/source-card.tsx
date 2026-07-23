"use client";

import { Control, useWatch } from "react-hook-form";
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@components/ui/input";
import { Textarea } from "@components/ui/textarea";
import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import { Instagram, Facebook, ImagePlus, Trash2 } from "lucide-react";
import {
    SOCIAL_HERO_ACCESS_TOKEN,
    SOCIAL_HERO_ACCESS_TOKEN_HINT,
    SOCIAL_HERO_ACCESS_TOKEN_STORED_PLACEHOLDER,
    SOCIAL_HERO_FB_PAGE_ID,
    SOCIAL_HERO_IG_USER_ID,
    SOCIAL_HERO_KIND_FACEBOOK,
    SOCIAL_HERO_KIND_INSTAGRAM,
    SOCIAL_HERO_KIND_MANUAL,
    SOCIAL_HERO_LIMIT_LABEL,
    SOCIAL_HERO_MANUAL_ALT,
    SOCIAL_HERO_MANUAL_ALT_HINT,
    SOCIAL_HERO_MANUAL_IMAGE_URL,
    SOCIAL_HERO_MANUAL_NETWORK_DOMAIN,
    SOCIAL_HERO_MANUAL_NETWORK_DOMAIN_HINT,
    SOCIAL_HERO_MANUAL_POST_URL,
    SOCIAL_HERO_NOT_WIRED_NOTE,
    SOCIAL_HERO_REMOVE_SOURCE,
    SOCIAL_HERO_SOURCE_LABEL,
    SOCIAL_HERO_SOURCE_LABEL_PLACEHOLDER,
} from "@ui-config/strings";
import type { SocialHeroFormValues } from "./index";

const KIND_META = {
    manual: { label: SOCIAL_HERO_KIND_MANUAL, Icon: ImagePlus },
    instagram: { label: SOCIAL_HERO_KIND_INSTAGRAM, Icon: Instagram },
    facebook: { label: SOCIAL_HERO_KIND_FACEBOOK, Icon: Facebook },
} as const;

interface SourceCardProps {
    control: Control<SocialHeroFormValues>;
    index: number;
    onRemove: () => void;
}

export default function SourceCard({
    control,
    index,
    onRemove,
}: SourceCardProps) {
    const base = `sources.${index}` as const;
    const kind = useWatch({ control, name: `${base}.kind` });
    const tokenStored = useWatch({ control, name: `${base}.tokenStored` });
    const tokenLast4 = useWatch({ control, name: `${base}.tokenLast4` });
    const meta = KIND_META[kind] ?? KIND_META.manual;
    const { Icon } = meta;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                    <Icon className="h-4 w-4" aria-hidden />
                    {meta.label}
                </CardTitle>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onRemove}
                >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    {SOCIAL_HERO_REMOVE_SOURCE}
                </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <FormField
                    control={control}
                    name={`${base}.label`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{SOCIAL_HERO_SOURCE_LABEL}</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder={
                                        SOCIAL_HERO_SOURCE_LABEL_PLACEHOLDER
                                    }
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {kind === "manual" && (
                    <>
                        <FormField
                            control={control}
                            name={`${base}.imageUrl`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {SOCIAL_HERO_MANUAL_IMAGE_URL}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            inputMode="url"
                                            {...field}
                                            value={field.value ?? ""}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={control}
                            name={`${base}.postUrl`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {SOCIAL_HERO_MANUAL_POST_URL}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            inputMode="url"
                                            {...field}
                                            value={field.value ?? ""}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={control}
                            name={`${base}.networkDomain`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {SOCIAL_HERO_MANUAL_NETWORK_DOMAIN}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="instagram.com"
                                            {...field}
                                            value={field.value ?? ""}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {SOCIAL_HERO_MANUAL_NETWORK_DOMAIN_HINT}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={control}
                            name={`${base}.alt`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {SOCIAL_HERO_MANUAL_ALT}
                                    </FormLabel>
                                    <FormControl>
                                        <Textarea
                                            rows={2}
                                            {...field}
                                            value={field.value ?? ""}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {SOCIAL_HERO_MANUAL_ALT_HINT}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </>
                )}

                {(kind === "instagram" || kind === "facebook") && (
                    <>
                        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                            {SOCIAL_HERO_NOT_WIRED_NOTE}
                        </p>
                        <FormField
                            control={control}
                            name={
                                kind === "instagram"
                                    ? `${base}.igUserId`
                                    : `${base}.pageId`
                            }
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {kind === "instagram"
                                            ? SOCIAL_HERO_IG_USER_ID
                                            : SOCIAL_HERO_FB_PAGE_ID}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            value={field.value ?? ""}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={control}
                            name={`${base}.accessToken`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {SOCIAL_HERO_ACCESS_TOKEN}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            autoComplete="off"
                                            placeholder={
                                                tokenStored
                                                    ? SOCIAL_HERO_ACCESS_TOKEN_STORED_PLACEHOLDER
                                                    : undefined
                                            }
                                            {...field}
                                            value={field.value ?? ""}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {tokenStored && tokenLast4
                                            ? `Stored ••••${tokenLast4}. ${SOCIAL_HERO_ACCESS_TOKEN_HINT}`
                                            : SOCIAL_HERO_ACCESS_TOKEN_HINT}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={control}
                            name={`${base}.limit`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {SOCIAL_HERO_LIMIT_LABEL}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={50}
                                            {...field}
                                            value={field.value ?? ""}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </>
                )}
            </CardContent>
        </Card>
    );
}
