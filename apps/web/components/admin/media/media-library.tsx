"use client";

import { AddressContext } from "@components/contexts";
import { FetchBuilder } from "@courselit/utils";
import { Chip, Image } from "@courselit/components-library";
import {
    MEDIA_MANAGER_EMPTY,
    MEDIA_MANAGER_LOAD_MORE,
    MEDIA_MANAGER_PAGE_HEADING,
    MEDIA_MANAGER_UNUSED,
} from "@ui-config/strings";
import {
    startTransition,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

interface MediaUsage {
    entityType: string;
    entityId: string;
    title: string;
}

interface MediaWithUsage {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    access: string;
    thumbnail?: string;
    usage: MediaUsage[];
}

const PAGE_SIZE = 30;

function formatSize(bytes: number): string {
    if (!bytes) return "—";
    const mb = bytes / 1048576;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// "course" -> "Course", "communityPost" -> "Community post"
function humanizeEntityType(entityType: string): string {
    const spaced = entityType.replace(/([a-z])([A-Z])/g, "$1 $2");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export default function MediaLibrary() {
    const [media, setMedia] = useState<MediaWithUsage[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const address = useContext(AddressContext);

    const fetch = useMemo(
        () =>
            new FetchBuilder()
                .setUrl(`${address.backend}/api/graph`)
                .setIsGraphQLEndpoint(true),
        [address.backend],
    );

    const loadMedia = useCallback(async () => {
        const query = `
            query ($page: Int, $limit: Int) {
                media: getMedias(page: $page, limit: $limit) {
                    mediaId
                    originalFileName
                    mimeType
                    size
                    access
                    thumbnail
                    usage { entityType entityId title }
                }
            }`;
        setLoading(true);
        try {
            const request = fetch
                .setPayload({ query, variables: { page, limit: PAGE_SIZE } })
                .build();
            const response = await request.exec();
            const batch: MediaWithUsage[] = response.media ?? [];
            setMedia((prev) => (page === 1 ? batch : [...prev, ...batch]));
            setHasMore(batch.length === PAGE_SIZE);
        } catch (e) {
            // GraphQL layer surfaces auth/permission errors; nothing to render.
        } finally {
            setLoading(false);
        }
    }, [fetch, page]);

    useEffect(() => {
        startTransition(() => {
            void loadMedia();
        });
    }, [loadMedia]);

    return (
        <div className="flex flex-col">
            <h1 className="text-4xl font-semibold mb-8">
                {MEDIA_MANAGER_PAGE_HEADING}
            </h1>

            {!loading && media.length === 0 && (
                <p className="text-muted-foreground">{MEDIA_MANAGER_EMPTY}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {media.map((m) => (
                    <div
                        key={m.mediaId}
                        className="flex flex-col rounded-lg border border-slate-200 overflow-hidden"
                    >
                        <div className="relative aspect-video bg-slate-100">
                            {m.thumbnail ? (
                                <Image
                                    src={m.thumbnail}
                                    alt={m.originalFileName}
                                    objectFit="cover"
                                    className="w-full h-full"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                    {m.mimeType}
                                </div>
                            )}
                            <div className="absolute top-2 right-2">
                                <Chip>{m.access}</Chip>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 p-4">
                            <p
                                className="font-medium truncate"
                                title={m.originalFileName}
                            >
                                {m.originalFileName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {m.mimeType} · {formatSize(m.size)}
                            </p>
                            <div className="mt-1">
                                {m.usage.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">
                                        {MEDIA_MANAGER_UNUSED}
                                    </p>
                                ) : (
                                    <ul className="flex flex-col gap-1">
                                        {m.usage.map((u, i) => (
                                            <li
                                                key={`${u.entityType}-${u.entityId}-${i}`}
                                                className="text-xs"
                                            >
                                                <span className="text-muted-foreground">
                                                    {humanizeEntityType(
                                                        u.entityType,
                                                    )}
                                                    :{" "}
                                                </span>
                                                <span>
                                                    {u.title || u.entityId}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {hasMore && (
                <button
                    className="mt-8 self-center text-sm underline"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={loading}
                >
                    {MEDIA_MANAGER_LOAD_MORE}
                </button>
            )}
        </div>
    );
}
