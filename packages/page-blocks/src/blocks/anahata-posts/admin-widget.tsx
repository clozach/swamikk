import React, { useEffect, useState } from "react";
import type { Address, Media, Profile } from "@courselit/common-models";
import type {
    Theme,
    ThemeStyle,
    SectionBackground,
} from "@courselit/page-models";
import {
    AdminWidgetPanel,
    AdminWidgetPanelContainer,
    Button,
    Button2,
    Checkbox,
    CssIdField,
    DragAndDrop,
    Form,
    FormField,
    MaxWidthSelector,
    MediaSelector,
    PageBuilderPropertyHeader,
    PageBuilderSlider,
    SectionBackgroundPanel,
    Select,
    Tooltip,
    VerticalPaddingSelector,
} from "@courselit/components-library";
import { generateUniqueId } from "@courselit/utils";
import { HelpCircle, PencilIcon } from "lucide-react";
import Settings, { Post, PostThumbnail } from "./settings";
import {
    buttonAction as defaultButtonAction,
    buttonCaption as defaultButtonCaption,
    heading as defaultHeading,
    headingLink as defaultHeadingLink,
    newPost,
    posts as defaultPosts,
    showDivider as defaultShowDivider,
    thumbnailSize as defaultThumbnailSize,
    thumbnailSrc,
    verticalPadding as defaultVerticalPadding,
} from "./defaults";

export interface AdminWidgetProps {
    name: string;
    settings: Settings;
    onChange: (...args: any[]) => void;
    address: Address;
    profile: Profile;
    hideActionButtons: (
        e: boolean,
        preservedStateAcrossRerender: Record<string, unknown>,
    ) => void;
    preservedStateAcrossRerender: Record<string, unknown>;
    theme: Theme;
}

export default function AdminWidget({
    settings,
    onChange,
    profile,
    address,
    hideActionButtons,
    preservedStateAcrossRerender,
    theme,
}: AdminWidgetProps): JSX.Element {
    const [heading, setHeading] = useState(settings.heading ?? defaultHeading);
    const [headingLink, setHeadingLink] = useState(
        settings.headingLink ?? defaultHeadingLink,
    );
    const [showDivider, setShowDivider] = useState(
        settings.showDivider ?? defaultShowDivider,
    );
    const [posts, setPosts] = useState<Post[]>(settings.posts ?? defaultPosts);
    const [thumbnailSize, setThumbnailSize] = useState(
        settings.thumbnailSize ?? defaultThumbnailSize,
    );
    const [buttonCaption, setButtonCaption] = useState(
        settings.buttonCaption ?? defaultButtonCaption,
    );
    const [buttonAction, setButtonAction] = useState(
        settings.buttonAction ?? defaultButtonAction,
    );
    const [cssId, setCssId] = useState(settings.cssId);
    const [maxWidth, setMaxWidth] = useState<
        ThemeStyle["structure"]["page"]["width"]
    >(settings.maxWidth);
    const [verticalPadding, setVerticalPadding] = useState<
        ThemeStyle["structure"]["section"]["padding"]["y"]
    >(settings.verticalPadding || defaultVerticalPadding);
    const [background, setBackground] = useState<SectionBackground>(
        settings.background,
    );
    const [postBeingEditedIndex, setPostBeingEditedIndex] = useState(-1);

    useEffect(() => {
        onChange({
            heading,
            headingLink,
            showDivider,
            posts,
            thumbnailSize,
            buttonCaption,
            buttonAction,
            cssId,
            maxWidth,
            verticalPadding,
            background,
        });
    }, [
        heading,
        headingLink,
        showDivider,
        posts,
        thumbnailSize,
        buttonCaption,
        buttonAction,
        cssId,
        maxWidth,
        verticalPadding,
        background,
    ]);

    // The page editor unmounts this panel while a sub-editor is open, so the
    // index of the post being edited round-trips through the parent.
    useEffect(() => {
        const selected = preservedStateAcrossRerender.selectedPost;
        if (typeof selected !== "number") {
            return;
        }
        if (selected === posts.length) {
            setPosts([...posts, newPost(generateUniqueId())]);
        }
        setPostBeingEditedIndex(selected);
    }, [preservedStateAcrossRerender]);

    const closeEditor = () => {
        setPostBeingEditedIndex(-1);
        hideActionButtons(false, {});
    };

    const onPostChange = (updated: Post) => {
        const next = [...posts];
        next[postBeingEditedIndex] = updated;
        setPosts(next);
        closeEditor();
    };

    const onPostDelete = () => {
        setPosts(posts.filter((_, index) => index !== postBeingEditedIndex));
        closeEditor();
    };

    if (postBeingEditedIndex !== -1 && posts[postBeingEditedIndex]) {
        return (
            <PostEditor
                post={posts[postBeingEditedIndex]}
                onChange={onPostChange}
                onDelete={onPostDelete}
                profile={profile}
                address={address}
            />
        );
    }

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["header", "posts", "call-to-action", "design"]}
        >
            <AdminWidgetPanel title="Header" value="header">
                <Form>
                    <FormField
                        label="Heading"
                        value={heading}
                        onChange={(e) => setHeading(e.target.value)}
                    />
                    <FormField
                        label="Heading link"
                        value={headingLink}
                        placeholder="Leave empty for a plain heading"
                        tooltip="Wraps the heading in a link, e.g. /blog"
                        onChange={(e) => setHeadingLink(e.target.value)}
                    />
                </Form>
                <div className="flex justify-between items-center mt-2">
                    <div className="flex grow items-center gap-1">
                        <p>Show divider</p>
                        <Tooltip title="The 200px rust rule beneath the heading">
                            <HelpCircle className="w-4 h-4" />
                        </Tooltip>
                    </div>
                    <Checkbox
                        checked={showDivider}
                        onChange={(value: boolean) => setShowDivider(value)}
                    />
                </div>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Posts" value="posts">
                <DragAndDrop
                    items={posts.map((post) => ({ post, id: post.id }))}
                    Renderer={({ post }: { post: Post }) => (
                        <div className="flex justify-between items-center w-full gap-2">
                            <p className="truncate">
                                {post.title || "Untitled"}
                            </p>
                            <Button2
                                size="icon"
                                variant="outline"
                                aria-label={`Edit ${post.title || "post"}`}
                                onClick={() =>
                                    hideActionButtons(true, {
                                        selectedPost: posts.findIndex(
                                            (p) => p.id === post.id,
                                        ),
                                    })
                                }
                            >
                                <PencilIcon className="w-4 h-4" />
                            </Button2>
                        </div>
                    )}
                    onChange={(reordered: { post: Post }[]) =>
                        setPosts(reordered.map(({ post }) => ({ ...post })))
                    }
                />
                <Button
                    component="button"
                    onClick={() =>
                        hideActionButtons(true, { selectedPost: posts.length })
                    }
                >
                    Add new post
                </Button>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Call to action" value="call-to-action">
                <Form>
                    <FormField
                        label="Button text"
                        value={buttonCaption}
                        onChange={(e) => setButtonCaption(e.target.value)}
                    />
                    <FormField
                        label="Button link"
                        value={buttonAction}
                        onChange={(e) => setButtonAction(e.target.value)}
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Design" value="design">
                <PageBuilderSlider
                    title="Thumbnail size"
                    min={80}
                    max={200}
                    unit="px"
                    value={thumbnailSize}
                    tooltip="Edge length of the square thumbnail on wide screens. It scales down automatically on phones."
                    onChange={(value?: number) =>
                        setThumbnailSize(value ?? defaultThumbnailSize)
                    }
                />
                <MaxWidthSelector
                    value={maxWidth || theme.theme.structure.page.width}
                    onChange={setMaxWidth}
                />
                <VerticalPaddingSelector
                    value={
                        verticalPadding ||
                        defaultVerticalPadding ||
                        theme.theme.structure.section.padding.y
                    }
                    onChange={setVerticalPadding}
                />
                <SectionBackgroundPanel
                    value={background}
                    onChange={setBackground}
                    profile={profile}
                    address={address}
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Advanced" value="advanced">
                <CssIdField value={cssId} onChange={setCssId} />
            </AdminWidgetPanel>
        </AdminWidgetPanelContainer>
    );
}

interface PostEditorProps {
    post: Post;
    onChange: (post: Post) => void;
    onDelete: () => void;
    profile: Profile;
    address: Address;
}

function PostEditor({
    post,
    onChange,
    onDelete,
    profile,
    address,
}: PostEditorProps): JSX.Element {
    const [title, setTitle] = useState(post.title);
    const [date, setDate] = useState(post.date);
    const [href, setHref] = useState(post.href);
    const [thumbnail, setThumbnail] = useState<PostThumbnail>(post.thumbnail);
    const [deleteConfirmation, setDeleteConfirmation] = useState(false);

    const alt = thumbnail.alt ?? "";
    const setAlt = (value: string) =>
        setThumbnail({ ...thumbnail, alt: value });

    const setKind = (kind: PostThumbnail["kind"]) => {
        if (kind === thumbnail.kind) {
            return;
        }
        setThumbnail(
            kind === "url"
                ? { kind: "url", url: "", alt }
                : { kind: "media", media: {}, alt },
        );
    };

    return (
        <div className="flex flex-col gap-4">
            <Form onSubmit={(e) => e.preventDefault()}>
                <FormField
                    label="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
                <FormField
                    label="Date"
                    value={date}
                    placeholder="April 20, 2026"
                    tooltip="Shown verbatim beneath the title"
                    onChange={(e) => setDate(e.target.value)}
                />
                <FormField
                    label="Link"
                    value={href}
                    placeholder="#"
                    onChange={(e) => setHref(e.target.value)}
                />
            </Form>

            <PageBuilderPropertyHeader
                label="Thumbnail"
                tooltip="Rendered as a square, cropped to fill"
            />
            <Select
                title="Image source"
                value={thumbnail.kind}
                options={[
                    { label: "File path", value: "url" },
                    { label: "Media library", value: "media" },
                ]}
                onChange={(value: PostThumbnail["kind"]) => setKind(value)}
            />
            {thumbnail.kind === "url" ? (
                <Form onSubmit={(e) => e.preventDefault()}>
                    <FormField
                        label="Image path"
                        value={thumbnail.url}
                        placeholder="/anahata/post-kumara-salad.jpg"
                        onChange={(e) =>
                            setThumbnail({
                                kind: "url",
                                url: e.target.value,
                                alt,
                            })
                        }
                    />
                </Form>
            ) : (
                <MediaSelector
                    title=""
                    src={thumbnail.media?.thumbnail}
                    srcTitle={thumbnail.media?.originalFileName}
                    profile={profile}
                    address={address}
                    onSelection={(media: Media) =>
                        media && setThumbnail({ kind: "media", media, alt })
                    }
                    onRemove={() =>
                        setThumbnail({ kind: "media", media: {}, alt })
                    }
                    strings={{}}
                    access="public"
                    mediaId={thumbnail.media?.mediaId}
                    type="page"
                />
            )}
            <Form onSubmit={(e) => e.preventDefault()}>
                <FormField
                    label="Image alt text"
                    value={alt}
                    placeholder={title}
                    tooltip="Describes the image to screen readers. Falls back to the title."
                    onChange={(e) => setAlt(e.target.value)}
                />
            </Form>
            {!thumbnailSrc(thumbnail) && (
                <p className="text-sm text-muted-foreground">
                    No image selected yet.
                </p>
            )}

            <div className="flex justify-between">
                <Tooltip title="Delete">
                    <Button
                        component="button"
                        variant="soft"
                        onClick={() => {
                            if (deleteConfirmation) {
                                onDelete();
                            } else {
                                setDeleteConfirmation(true);
                            }
                        }}
                    >
                        {deleteConfirmation ? "Sure?" : "Delete"}
                    </Button>
                </Tooltip>
                <Tooltip title="Go back">
                    <Button
                        component="button"
                        onClick={() =>
                            onChange({
                                id: post.id,
                                title,
                                date,
                                href,
                                thumbnail,
                            })
                        }
                    >
                        Done
                    </Button>
                </Tooltip>
            </div>
        </div>
    );
}
