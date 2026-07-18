"use client";

import { useState, useEffect, useContext, useCallback } from "react";
import type { ContentItem } from "@/components/admin/my-content/content";
import { AddressContext, ProfileContext } from "@components/contexts";
import { FetchBuilder } from "@courselit/utils";
import { MembershipEntityType } from "@courselit/common-models";
import { MyContentCard } from "@components/admin/my-content/content-card";
import { SkeletonCard } from "@components/skeleton-card";
import { MyContentEmptyState } from "./empty-state";
import { MyContentErrorState } from "./error-state";
import {
    MY_CONTENT_BROWSE_PRODUCTS,
    MY_CONTENT_EMPTY_PRODUCTS,
} from "@ui-config/strings";

function ContentGrid({ items }: { items: ContentItem[] }) {
    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
                <MyContentCard key={item.entity.id} item={item} />
            ))}
        </div>
    );
}

function SkeletonGrid() {
    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, index) => (
                <SkeletonCard key={index} />
            ))}
        </div>
    );
}

export default function MyContentView({
    type,
}: {
    type: MembershipEntityType;
}) {
    const [data, setData] = useState<ContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const { profile } = useContext(ProfileContext);
    const address = useContext(AddressContext);

    const getUserContent = useCallback(async () => {
        const query = `
            query {
                content: getUserContent {
                    entityType
                    entity {
                        id
                        title
                        slug
                        membersCount
                        totalLessons
                        completedLessonsCount
                        featuredImage {
                            file
                            thumbnail
                        }
                        type
                        certificateId
                    }
                }
            }
            `;

        try {
            const fetch = new FetchBuilder()
                .setUrl(`${address.backend}/api/graph`)
                .setPayload(query)
                .setIsGraphQLEndpoint(true)
                .build();
            setLoading(true);
            setError(false);
            const response = await fetch.exec();
            if (response.content) {
                setData(response.content);
            }
        } catch (e: any) {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [address.backend]);

    useEffect(() => {
        if (!profile) {
            return;
        }

        getUserContent();
    }, [profile, getUserContent]);

    const items = data.filter(
        (item) => item.entityType.toLowerCase() === type.toLowerCase(),
    );

    if (loading) {
        return <SkeletonGrid />;
    }

    if (error) {
        return (
            <MyContentErrorState
                title="We couldn't load your content just now"
                onRetry={getUserContent}
            />
        );
    }

    if (items.length === 0) {
        return (
            <MyContentEmptyState
                title={MY_CONTENT_EMPTY_PRODUCTS}
                actionLabel={MY_CONTENT_BROWSE_PRODUCTS}
                actionHref="/products"
            />
        );
    }

    return <ContentGrid items={items} />;
}
