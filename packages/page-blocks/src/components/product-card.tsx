import React from "react";
import {
    Image,
    Link,
    Skeleton,
    MediaPlayer,
} from "@courselit/components-library";
import { Media, mediaPlayerUi, catalogMediaUi } from "@courselit/common-models";
import { Badge, PageCardHeader, Subheader1 } from "@courselit/page-primitives";
import { PageCardContent } from "@courselit/page-primitives";
import { PageCard, PageCardImage } from "@courselit/page-primitives";
import { ThemeStyle } from "@courselit/page-models";

export function ProductCard({
    title,
    user,
    theme,
    href,
    image,
    badgeChildren,
    productType,
    previewAudio,
}: {
    title: string;
    user: {
        name: string;
        thumbnail: string;
    };
    theme?: ThemeStyle;
    href: string;
    image: string;
    badgeChildren?: any;
    productType?: string;
    previewAudio?: Media;
}) {
    return (
        <PageCard
            className="flex flex-col overflow-hidden w-full"
            theme={theme}
        >
            <Link href={href} className="flex flex-col grow">
                <PageCardImage
                    src={image}
                    alt={title}
                    className="aspect-video object-cover"
                    theme={theme}
                />
                <PageCardContent theme={theme} className="flex flex-col grow">
                    {productType && (
                        <p className="text-xs font-medium mb-2">
                            {productType}
                        </p>
                    )}
                    <PageCardHeader theme={theme} className="grow">
                        {title}
                    </PageCardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Image
                                src={user?.thumbnail}
                                alt={user?.name || ""}
                                width="w-8"
                                height="h-8"
                                className="rounded-full"
                                objectFit="cover"
                            />
                            <Subheader1 theme={theme}>{user?.name}</Subheader1>
                        </div>
                        {badgeChildren && (
                            <Badge theme={theme}>{badgeChildren}</Badge>
                        )}
                    </div>
                </PageCardContent>
            </Link>
            {previewAudio?.file && (
                <div className="px-4 pb-4">
                    <p className="text-xs font-medium mb-2">
                        {catalogMediaUi.preview}
                    </p>
                    <MediaPlayer
                        kind="audio"
                        compact
                        src={previewAudio.file}
                        title={`${catalogMediaUi.preview}: ${title}`}
                        labels={mediaPlayerUi}
                    />
                </div>
            )}
        </PageCard>
    );
}

export function ProductCardSkeleton({ theme }: { theme?: ThemeStyle }) {
    return (
        <PageCard className="overflow-hidden" theme={theme}>
            <Skeleton className="aspect-video w-full" />
            <PageCardContent theme={theme}>
                <Skeleton className="h-6 w-3/4 mb-4" />
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <Skeleton className="w-12 h-12 rounded-full" />
                        <Skeleton className="h-5 w-32" />
                    </div>
                    <Skeleton className="h-6 w-24" />
                </div>
            </PageCardContent>
        </PageCard>
    );
}
