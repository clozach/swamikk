export const pageEditCopy = {
    edit: "Edit selected text or image",
    title: "Prepare a page edit",
    intro: "Choose one field. You can make a simple edit here or copy its context for a larger prompt. The page changes only after you approve its preview.",
    field: "Field to edit",
    summary: "What should this change accomplish?",
    prepare: "Prepare preview",
    loading: "Loading editable fields…",
    empty: "This block has no supported text or image fields yet. Leave a comment to prepare a broader change.",
    failed: "The preview could not be prepared. Your draft is kept. Refresh the field before retrying if the page changed.",
    image: "Choose a public library image",
    imageAccess:
        "Choose an image intended for the public page. Member-only files and private comment photos cannot be used here.",
    alt: "Alternative text (leave empty for a decorative image)",
    prompt: "Copy authoring context",
    copied: "Authoring context copied. Return here to review any proposal prepared from it.",
} as const;
