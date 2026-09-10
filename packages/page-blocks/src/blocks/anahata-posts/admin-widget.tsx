import React, { useEffect, useState } from "react";
import type { Address, Profile } from "@courselit/common-models";
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
    CssIdField,
    DragAndDrop,
    Form,
    FormField,
    MaxWidthSelector,
    SectionBackgroundPanel,
    Tooltip,
    VerticalPaddingSelector,
} from "@courselit/components-library";
import { generateUniqueId } from "@courselit/utils";
import { PencilIcon } from "lucide-react";
import type { ImageSource } from "../../components/image-source";
import { hasWell } from "../../components/image-source";
import { ImageSourceField } from "../../components/image-source-field";
import Settings, { MoreLink, Post, PostImage } from "./settings";
import { normalizePostThumbnail } from "./thumbnail";
import {
    heading as defaultHeading,
    headingLink as defaultHeadingLink,
    moreLink as defaultMoreLink,
    newPost,
    posts as defaultPosts,
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
    const [posts, setPosts] = useState<Post[]>(settings.posts ?? defaultPosts);
    // A pre-redesign layout's `buttonCaption`/`buttonAction` pair seeds the
    // link once; from here on only `moreLink` is written.
    const [moreLink, setMoreLink] = useState<MoreLink>(
        settings.moreLink ??
            (settings.buttonCaption && settings.buttonAction
                ? { label: settings.buttonCaption, href: settings.buttonAction }
                : defaultMoreLink),
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
            posts,
            moreLink,
            cssId,
            maxWidth,
            verticalPadding,
            background,
        });
    }, [
        heading,
        headingLink,
        posts,
        moreLink,
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
            defaultValue={["header", "posts", "more-link", "design"]}
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

            <AdminWidgetPanel title="Link under the cards" value="more-link">
                <Form>
                    <FormField
                        label="Label"
                        value={moreLink.label}
                        placeholder={defaultMoreLink.label}
                        tooltip="Leave empty to hide the link"
                        onChange={(e) =>
                            setMoreLink({ ...moreLink, label: e.target.value })
                        }
                    />
                    <FormField
                        label="Link"
                        value={moreLink.href}
                        placeholder={defaultMoreLink.href}
                        onChange={(e) =>
                            setMoreLink({ ...moreLink, href: e.target.value })
                        }
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Design" value="design">
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
    // Whatever shape came in (current or legacy flat), the editor holds and
    // writes back the current one.
    const [thumbnail, setThumbnail] = useState<PostImage>(() =>
        normalizePostThumbnail(post.thumbnail),
    );
    const [deleteConfirmation, setDeleteConfirmation] = useState(false);

    const setSource = (source: ImageSource) =>
        setThumbnail({ ...thumbnail, source });
    const setAlt = (alt: string) => setThumbnail({ ...thumbnail, alt });

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
                    placeholder="September 7, 2026"
                    tooltip="Shown verbatim beneath the title"
                    onChange={(e) => setDate(e.target.value)}
                />
                <FormField
                    label="Link"
                    value={href}
                    placeholder="/blog/post-slug"
                    onChange={(e) => setHref(e.target.value)}
                />
            </Form>

            <ImageSourceField
                label="Thumbnail"
                tooltip="Shown 3:2, cropped to fill. Pick Placeholder and describe the photo until the real one arrives."
                value={thumbnail.source}
                onChange={setSource}
                urlPlaceholder="/anahata/post-roasted-vegetable-salad.jpg"
                profile={profile}
                address={address}
            />
            <Form onSubmit={(e) => e.preventDefault()}>
                <FormField
                    label="Image alt text"
                    value={thumbnail.alt}
                    placeholder={title}
                    tooltip="Describes the image to screen readers. Falls back to the title; a placeholder's description stands in until then."
                    onChange={(e) => setAlt(e.target.value)}
                />
            </Form>
            {!hasWell(thumbnail.source) && (
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
