/**
 * This file provides strings used app wide.
 */
import { UIConstants } from "@courselit/common-models";

export const responses = {
    error: "Error",
    domain_missing: "Domain is missing",
    domain_doesnt_exist: "Domain does not exist",
    domain_super_admin_email_missing:
        "SUPER_ADMIN_EMAIL environment variable is not defined",
    not_valid_subscription: "No valid subscription found",
    sign_in_mail_prefix: "Sign in to",
    sign_in_mail_body: "Click the following link to sign in.",
    sign_in_link_text: "Sign in",

    // graphql responses
    past_date: "Date cannot be in the past",
    invalid_permission: "Invalid permission",
    user_not_found: "User not found.",
    request_not_authenticated: "Request not authenticated",
    content_cannot_be_null: "Content cannot be empty",
    media_id_cannot_be_null: "Media cannot be empty",
    item_not_found: "Item not found",
    drip_not_released: "This section is not yet released for you",
    membership_ended_content:
        "Your membership has ended. You can still open the content released to you during your membership from My content.",
    purchase_refunded_content:
        "This purchase was fully refunded, so its content access has ended. Other valid purchases remain available in My content.",
    not_a_creator: "You do not have rights to perform this action",
    course_not_empty: "Delete all lessons before trying deleting the course",
    invalid_offset: "Invalid offset",
    is_not_admin: "Insufficient privileges",
    is_not_admin_or_creator: "Insufficient privileges",
    blog_description_empty: "Description field is required",
    cannot_convert_to_blog:
        "The course has lessons hence cannot be converted to a post",
    cost_not_provided: "Cost field is required",
    invalid_cost: "Invalid cost",
    cannot_add_to_blogs: "Cannot add lessons to a blog post",
    file_is_required: "A file is required",
    error_in_moving_file: "Error in moving file",
    success: "success",
    user_name_cant_be_null: "Name cannot be null",
    action_not_allowed: "You do not have rights to perform this action",
    invalid_input: "Invalid input",
    payment_invalid_settings: "Payment configuration is invalid",
    payment_info_required: "Add payment method before creating a paid plan",
    unrecognised_currency_code: "Unrecognised currency code",
    only_admins_can_purchase:
        "Only admins can purchase courses on behalf of others",
    course_already_purchased: "You have already purchased this item",
    payment_settings_invalid_suffix: "settings are invalid",
    invalid_course_id: "Invalid course ID",
    invalid_user_id: "Invalid user ID",
    payment_settings_invalid:
        "Payment method is not set up. Please contact site admin.",
    not_enrolled: "You are not enrolled in the course",
    currency_iso_not_set:
        "Currency ISO code is not set. Please contact site admin.",
    payment_method_not_saved:
        "Set a payment method before setting its corresponding secret key",
    invalid_payment_method: "Invalid payment method",
    invalid_theme: "Invalid theme",
    theme_not_installed: "The theme is not installed",
    invalid_layout: "Invalid layout",
    missing_mandatory_blocks: "Missing mandatory blocks",
    destination_dont_exist: "Destination does not exist",
    page_exists: "A page with the URL already exists",
    invalid_format: "Invalid format",
    no_thumbnail: "No thumbnail available",
    file_size_exceeded: "File size exceeded",
    name_is_required: "Name is required",
    mimetype_is_required: "Mimetype is required",
    existing_group: "A group with that name exists",
    group_not_empty: "This section has lessons. Delete them before proceeding",
    group_not_found: "Section not found",
    update_payment_method:
        "You need to set up a payment method to create paid content.",
    currency_iso_code_required:
        "Currency ISO code is required. Examples: usd, inr, gbp etc.",
    currency_unit_required:
        "A currency symbol is required. Examples: $, ₹, £ etc.",
    school_title_not_set:
        "Give your school a title before setting payment info.",
    internal_error: "An internal error occurred. Please try again.",
    presigned_url_failed: "That did not work! Please go back and try again.",
    file_uploaded: "The file is uploaded. Go back to see your media.",
    media_deleted: "The media is deleted. Go back to see your media.",
    invalid_access_type: "The access type can either be public or private.",
    answers_missing: "Answers are missing.",
    cannot_be_evaluated: "This lesson cannot be evaluated.",
    need_to_pass: "You need to pass this test in order to mark it completed.",
    no_correct_answer:
        "Every question needs to have at least one correct answer.",
    no_empty_option: "Options without text are not allowed in questions.",
    medialit_apikey_notfound: "You need to configure MediaLit to upload files.",
    mail_already_sent: "The mail is already sent",
    mail_subject_length_exceeded: `Subject cannot be longer than ${UIConstants.MAIL_SUBJECT_MAX_LENGTH} characters`,
    mail_max_recipients_exceeded: `Total number of recipients cannot exceed ${UIConstants.MAIL_MAX_RECIPIENTS}`,
    invalid_mail: "To, Subject and Body fields are required",
    email_delivery_failed_for_all_recipients:
        "Email delivery failed for all recipients",
    courses_cannot_be_downloaded: "A course cannot be offered as a download.",
    apikey_already_exists: "Apikey with that name already exists",
    email_template_already_exists: "A template with that name already exists",
    sequence_details_missing: "The following settings are missing",
    invalid_emails_order: "Invalid emails order",
    no_published_emails: "No published emails",
    sequence_not_active: "Sequence not active",
    sequence_already_started: "Sequence already started",
    mailing_address_too_short: "Mailing address is too short",
    cohort_exists: "A cohort with the same name already exists for this course",
    mail_settings_incomplete:
        "Email sending is not configured for this school. Set a mailing address and mail quota first",
    mandatory_tags_missing: "Mandatory tags are missing",
    cannot_delete_last_email: "Cannot delete the last email in the sequence",
    invalid_drip_email: "Drip email needs a subject and a body",
    cannot_invite_to_unpublished_product:
        "Cannot invite customers to an unpublished product",
    rejection_reason_missing: "Rejection reason is missing",
    joining_reason_missing: "Joining reason required",
    invalid_category: "Invalid category",
    community_exists: "A community with the same name already exists",
    payment_plan_required: "Add a payment plan before performing this action",
    community_requires_payment: "Community requires payment",
    community_has_no_payment_plans: "Community has no payment plans",
    duplicate_payment_plan: "A payment plan with the same type already exists",
    default_payment_plan_cannot_be_archived:
        "Default payment plan cannot be archived",
    default_payment_plan_required:
        "Mark a payment plan as default before enabling the community",
    community_content_already_reported: "Content already reported",
    profile_incomplete: "Complete your profile to perform this action",
    cannot_reject_member_with_active_subscription:
        "Cannot reject a member with an active subscription",
    cannot_leave_community_last_moderator:
        "Last manager cannot leave the community",
    cannot_delete_last_permission_user:
        "Cannot delete the last user with required permissions:",
    cannot_change_role_inactive_member:
        "Cannot change role of a member who is not active",
    cannot_change_role_last_moderator:
        "Cannot change role of the last moderator",
    cannot_delete_last_category: "Cannot delete the last category",
    lead_magnet_invalid_settings:
        "Product must have exactly one free payment plan to enable lead magnet",
    certificate_invalid_settings: "Certificate can only be enabled for courses",
    sso_provider_already_exists:
        "A SSO provider with the same provider ID already exists",
    quiz_cannot_be_previewed: "Quiz cannot be previewed",

    // api responses
    digital_download_no_files:
        "This digital download is empty. Please contact the creator.",
    download_link_expired: "The download link has expired",
    user_already_exists: "The user already exists",
    unsubscribe_success:
        "Sorry to see you go. You have been unsubscribed from our mailing list.",
    download_course_cannot_have_groups: "Digital download cannot have sections",
    download_course_last_group_cannot_be_removed:
        "Last section cannot be removed from a digital download",
    certificate_demo_course_id_required:
        "CourseID is required for demo certificate",
    provider_not_configured: "Configure the provider before enabling",
    provider_invalid_configuration: "Invalid provider configuration",
    page_id_already_exists:
        "This URL slug is already in use. Please choose a different one.",
    stripe_not_configured:
        "Connect Stripe in Settings > Payment before managing coupons",
    coupon_discount_invalid:
        "Provide exactly one of a percentage discount or a fixed amount off",
    coupon_duration_invalid:
        "Coupon duration must be once, repeating, or forever",
    coupon_duration_months_required:
        "A repeating coupon needs the number of months it repeats for",
};

export const feedbackUi = {
    open: "Comment on this page",
    close: "Close",
    select: "Choose a part of the page",
    selectHelp:
        "Hold Ctrl or ⌘ and click a component. On touch or keyboard, choose from the page below. Your selection stays put when you scroll.",
    page: "Whole page",
    comment: "Add a comment",
    commentLabel: "What would you like us to know?",
    privacy:
        "Comments go privately to the support team. Please leave out passwords, payment details and sensitive health information.",
    send: "Send",
    sendLabel: "Send comment",
    sending: "Sending…",
    sent: "Comment received. Thank you — the support team can now review it.",
    photo: "Attach a photo (admin)",
    pasteHint: "Or paste an image from the clipboard while typing.",
    pasting: "Uploading the pasted image…",
    pasteFailed: "The pasted image did not upload. Your text is kept.",
    copy: "Copy prompt",
    copied: "Prompt copied. Inspect and edit it on your Mac before sharing.",
    copyPageScope: "Copies all saved open comments for this page.",
    copyHandoff:
        "Inspect/edit the text, then submit it in ChatGPT (Codex) or Claude.app (Code mode) on macOS.",
    copyPrivacy:
        "Photo IDs are included; image files and signed URLs are not. Share private files separately, only when you choose.",
    noComments: "There are no saved comments for this page yet.",
    copyFailed:
        "Clipboard access was unavailable. The prompt is ready below for you to select and copy.",
    failed: "We could not save this comment. Your draft is still here; please try again.",
    draftKept: "Draft kept in this tab until you send or clear it.",
    clear: "Clear draft",
    chooseAgain: "Choose another component",
    review: "Comments & changes",
    inbox: "Comments",
    proposals: "Proposed changes",
    reload: "Refresh",
    build: "Build anything",
    organize: "Organize content",
    contentGuide:
        "See what is available, open a product as a member sees it, and request changes in context.",
    products: "Products",
    title: "Title",
    status: "Status",
    members: "Members",
    published: "Published",
    unpublished: "Draft",
    preview: "Open preview",
    contentEmpty:
        "No products yet. Ask your development agent to prepare the first one from your material.",
    previous: "Previous",
    next: "Next",
    guide: "Add comments in context. Choose Copy prompt, inspect/edit the text, then submit it in ChatGPT (Codex) or Claude.app (Code mode) on macOS.",
    approvalGuide:
        "Ask the model to prepare a proposal. Review its effects here before you approve it. Failed attempts keep their drafts and offer recovery.",
    legacy: "Legacy builder",
    legacyDescription:
        "Optional CourseLit authoring tools. The comment and approval workflow works independently of this fallback.",
    loading: "Loading…",
    emptyInbox: "No comments yet. Use the ? button on any page to leave one.",
    emptyProposals:
        "No proposals yet. Your development agent can prepare a lesson text change from a saved comment.",
    loadFailed: "This view could not be loaded. Refresh to try again.",
    accessDenied: "This view is available to site administrators.",
    before: "Before this change",
    after: "Reviewed version",
    undoSummary: "Restore “{title}” to its earlier text.",
    consequences: "What this changes",
    approve: "Approve this version",
    reject: "Keep current version",
    recover: "Check and recover",
    undo: "Prepare undo for review",
    applied: "Approved and applied",
    proposed: "Ready for review",
    rejected: "Not applied",
    stale: "Content changed — prepare a fresh proposal",
    failedState: "Attempt failed — draft retained",
    applying: "Application in progress",
    uncertain: "Check the result before continuing",
    version: "Version",
    reason: "Request",
    textScope:
        "This proposal changes lesson text only. Prices, access rules, release dates and emails stay as they are.",
    publishedEffect:
        "People who can open this published lesson will see the new text after approval.",
    draftEffect:
        "This lesson belongs to an unpublished product. Applying this text does not publish the product.",
    undoLimit:
        "Undo creates another proposal for review. It cannot retract something already viewed or emailed.",
    exactApproval:
        "Approval applies only to the version shown. If the lesson changes first, a fresh review is required.",
    return: "Back to all changes",
    closeComment: "Mark handled",
    reopenComment: "Reopen",
    savedPrompt: "Copy prompt",
    photoCount: "Admin photo attachments",
    actionFailed:
        "The action did not finish. Refresh to check its result before trying again.",
    previousVersions: "Previous proposals retained",
};

export const internal = {
    error_unrecognised_payment_method: "Unrecognized payment method",
    error_payment_method_not_implemented: "Not yet implemented",
    error_db_connection_failed:
        "Unable to establish a connection to the database.",
    error_env_var_undefined: "A required environment variable is not defined",
    app_running: "CourseLit server is running on",
    invalid_cloud_storage_settings: "Cloud storage settings are invalid",
    domain_not_specified: "Domain is not specified",
    default_group_name: "First section",
    default_email_broadcast_subject: "Untitled broadcast",
    default_email_sequence_subject: "First email",
    default_email_sequence_name: "Untitled Sequence",
    joining_reason_creator: "Joined as creator",
};

export const memberMimicUi = {
    title: "Member Mimic",
    opening: "Opening this member's profile…",
    openFailed: "The member view could not be opened.",
    retry: "Try again",
    returnToMembers: "Back to members",
    viewing: "Viewing as",
    readOnly: "Member view · changes are recorded as you",
    privacy:
        "Personal practice history, private messages and drafts are hidden.",
    exit: "Exit Mimic",
    exiting: "Returning to your admin view…",
    exitFailed:
        "The member view could not be closed. Try again; changes remain disabled.",
    expired: "This member view has ended",
    expiredHelp:
        "Exit to return to your admin account. Member information stays hidden until you start a new view.",
    verifying: "Checking this member view…",
    outside: "This page is outside the member view",
    outsideHelp:
        "Exit Mimic to use admin tools, checkout, private activity or account actions.",
    profile: "Member profile",
    content: "My content",
    privateProgress: "Personal practice history is hidden in Mimic.",
    privateActivity:
        "This activity contains personal learner data and is hidden in Mimic.",
    noChanges:
        "Use Edit member to change account details; nothing else can be sent from Mimic.",
};
export { mediaPlayerUi, catalogMediaUi } from "@courselit/common-models";

/** Editing a member's record from inside Member Mimic. The panel docks beside the member's page; every button carries its chord. */
export const memberEditUi = {
    emailEffectsPending:
        "The address is saved. Ending old sign-ins or sending the notice still needs to finish.",
    retryEmailEffects: "Finish email update",
    open: "Edit member",
    openShortcut: "⌥⌘E",
    openTitle: "Change this member's account details (⌥⌘E)",
    title: "Edit member",
    loading: "Reading this member's record…",
    loadFailed: "This member's record could not be read.",
    retry: "Try again",
    fields: {
        name: "Name",
        email: "Sign-in email",
        contact: "Preferred contact",
        checkIns: "Check-ins",
    },
    contactKindLabel: "Reached by",
    contactKind: {
        email: "Email",
        voice: "Phone call",
        text: "Text message",
    },
    contactEmail: "Email address",
    contactPhone: "Phone number",
    checkIns: {
        none: "None",
        occasional: "Occasional",
    },
    /** Per-field labels for History rows; the compound contact row splits into its two stored fields. */
    changeLabels: {
        name: "Name",
        email: "Sign-in email",
        "contact.kind": "Preferred contact · reached by",
        "contact.value": "Preferred contact · address or number",
        checkIns: "Check-ins",
    },
    emailHelp:
        "Sign-in codes go to this address. Changing it sends a code to the new address first, and a notice to the old one.",
    emailLockSelf:
        "This is your own account. Its sign-in email cannot be changed from Member Mimic.",
    emailLockOwner:
        "This is the site owner's account. Its sign-in email stays as it is.",
    save: "Save",
    saved: "Saved",
    undone: "Undone",
    redone: "Redone",
    restored: "Restored",
    undo: "Undo",
    undoShortcut: "⌘Z",
    redo: "Redo",
    redoShortcut: "⇧⌘Z",
    done: "Done",
    doneShortcut: "⎋",
    history: "History",
    historyTitle: "Edits to this member",
    historyIntro:
        "Every change to this member's record, newest first, with who made it and the exact before and after. Restore brings that value back; the restore is recorded too.",
    historyEmpty: "No edits to this member yet.",
    historyMore: "Show earlier edits",
    historyLoading: "Reading the history…",
    restoreRed: "Restore the red text",
    alreadyCurrent: "The record already shows the red text",
    before: "BEFORE",
    after: "AFTER",
    reverses: "↶ reverses an earlier edit",
    you: "you",
    other: "another admin",
    codeSent: "A code was sent to {email}. Ask the member for it.",
    codeLabel: "Six-digit code",
    confirm: "Confirm",
    resend: "Send a new code",
    cancel: "Cancel",
    wrongCode: "That code is not right. {n} tries left.",
    codeExpired:
        "That code has expired. Save the address again to send a new one.",
    codeCancelled: "The address change was cancelled. Nothing changed.",
    codeResent: "A new code was sent to {email}.",
    emailChanged:
        "Sign-in email changed. The member signs in with the new address from now on.",
    stale: "This record changed elsewhere; the values shown are current now.",
    failed: "The result could not be confirmed. Reload the page to check the saved record before trying again.",
    unchanged: "Nothing to change.",
    reviewRefunds: "Review refunds",
    reviewRefundsHelp: "Exits Mimic and opens Refund review.",
    pendingRefund: "This member has a refund request waiting.",
    unsaved: "Not saved yet: {fields}",
    dismiss: "Dismiss",
} as const;

export const dripAdminUi = {
    title: "Release schedule",
    intro: "Plan when each section becomes available. Every section releases its published lessons together.",
    course: "Content collection",
    empty: "No content collections are available to manage.",
    choose: "Choose a collection",
    section: "Section",
    rule: "Release rule",
    available: "Available now",
    exact: "On a date",
    relative: "After a delay",
    unknown: "Legacy rule needs attention",
    exactDate: "Date and time (UTC)",
    delay: "Delay in days (24 hours each)",
    delayHelp:
        "The first relative delay starts at membership enrollment. Later delays start from the previous actual relative release; a late release can move the following dates.",
    availabilityRestriction:
        "Available now can change to or from a schedule only while a collection is unpublished and has no current members. Existing member availability must first be preserved. Scheduled dates, delays, order and messages can still be reviewed.",
    availableHelp:
        "Available now opens this section to active members. It is not a pause control. Moving a date later does not remove a section already released.",
    timezone: "Dates use UTC. Your local time is shown alongside exact dates.",
    notification: "Send the existing section message on release",
    notificationOn: "Release message: on",
    notificationOff: "Release message: off",
    notificationUnprepared: "Release message: not prepared",
    notificationHelp:
        "Turning notifications off holds pending messages. Turning them on can resume pending work. A message already being sent cannot be recalled. Available now does not create a release email.",
    noMessage:
        "No release message is prepared. Use a contextual comment to request one before enabling notifications.",
    invalidMessage:
        "This legacy message cannot be previewed. Repair it before enabling notifications.",
    up: "Move earlier",
    down: "Move later",
    order: "Section order",
    save: "Save draft and review",
    saving: "Working…",
    drafts: "Recent drafts and results",
    version: "Version",
    review: "Review before approval",
    expires: "Review expires",
    approve: "Approve this schedule",
    refresh: "Refresh review",
    discard: "Discard draft",
    reconcile: "Check what happened",
    restore: "Prepare restoration draft",
    before: "Current settings",
    after: "Proposed settings",
    retained:
        "Canceled members keep their frozen retained lessons. This schedule does not add future drops or pre-start archive to their access. Unknown legacy publication dates remain unknown.",
    inFlight:
        "A release or message already being processed may finish under the previous settings. Saving a schedule cannot retract content already viewed, grants already recorded, or mail already sent.",
    messagePreview: "Release message template",
    templateHelp:
        "Member details, product links and the unsubscribe link are filled when mail is prepared. Remote images are omitted here. Previously queued messages may contain an earlier template.",
    unpublished:
        "This collection is unpublished. Saving its rules will not release content or queue messages until it is published.",
    acknowledge:
        "I reviewed the rules, section order, member effects and notification settings below.",
    changed:
        "Your controls have unsaved changes. Save and review a new version before approving.",
    stale: "This review changed or expired. Refresh it and review the new effects.",
    applied:
        "The schedule was saved. Content releases and message delivery happen separately; their current counts appear in a refreshed review.",
    uncertain:
        "The result needs checking. Reconcile this operation before trying another schedule change.",
    restoreHelp:
        "Restoration creates another approval draft. It cannot remove content or mail already delivered.",
    failed: "Could not finish this request. Refresh its status before retrying.",
    missing: "Choose a section to prepare its schedule.",
    currentMembers: "Active members",
    processingMembers: "Access changes in progress",
    endedPeriods: "Ended membership periods",
    alreadyReleased: "Already received this section",
    newlyAvailable: "Members gaining content now",
    recipients: "Members with release mail due now",
    unknownAnchors: "Unrecorded enrollment anchors",
    pending: "Pending messages for this section",
    dispatching: "Messages already being sent",
    sent: "Messages recorded as sent",
    uncertainMessages: "Messages with uncertain outcomes",
    samples: "Example release dates",
    released: "Already released",
    unknownDate: "Unknown date",
    publishedLessons: "published lessons",
    draftLessons: "draft lessons",
    legacyDates: "unrecorded publication dates",
    history: "Earlier reviewed versions",
    noDrafts: "No saved release drafts yet.",
    status: {
        draft: "Awaiting approval",
        stale: "Review needs refreshing",
        applying: "Applying schedule",
        uncertain: "Result needs checking",
        applied: "Schedule saved",
        "not-applied": "Schedule not applied",
        discarded: "Draft discarded",
    },
} as const;

export { contactPreferencesCopy } from "./contact-preferences-copy";

export const purchaseRemovalUi = {
    transactionsHelp:
        "Every purchase recorded across your products. Payment and refund history is kept, including provider test payments. Removal is offered only for test records without financial evidence.",
    productHelp:
        "Every purchase recorded for this product. Payment and refund history is kept, including provider test payments. Removal is offered only for test records without financial evidence.",
    remove: "Remove test transaction",
    unavailable: "Removal eligibility is unavailable. Refresh this list.",
    reasons: {
        "financial-history": "Kept for payment and refund reconciliation.",
        "live-payment": "Live payment history is kept.",
        "membership-changed":
            "Membership has changed. Ask support to review removal.",
    },
} as const;

/** Inline (WYSIWYG) text editing for site managers. Shortcuts sit in the labels: a magnet button says how to reach it without a mouse. */
export const textEditUi = {
    toggle: "Edit page",
    toggleShortcut: "⌥⌘E",
    toggleTitle: "Edit text, replace images and remove sections (⌥⌘E)",
    loading: "Opening the page editor…",
    editing: "Editing page",
    count: "{n} text fields",
    none: "No editable text found on this page",
    done: "Done",
    doneShortcut: "⎋",
    undo: "Undo",
    undoShortcut: "⌘Z",
    redo: "Redo",
    redoShortcut: "⇧⌘Z",
    history: "History",
    historyTitle: "Page history",
    textHistoryTitle: "Text and image changes",
    historyIntro:
        "Restore sections, earlier text or images here. Each restore is recorded too. Header and footer edits show on every page.",
    historyEmpty: "No inline edits on this page yet.",
    historyMore: "Show earlier edits",
    historyGone:
        "That item is no longer on this page. If its section was removed, restore its section first.",
    restoreRed: "Restore the red text",
    alreadyCurrent: "The page already shows the red text",
    before: "BEFORE",
    after: "AFTER",
    reverses: "reverses an earlier edit",
    formattingKept: "Formatting inside this paragraph is kept as it was.",
    restored: "Earlier version restored. Undo with ⌘Z or from History.",
    you: "you",
    other: "another editor",
    sitewide: "site-wide",
    saved: "Saved. Undo with ⌘Z or from History.",
    undone: "Undone. Redo with ⇧⌘Z.",
    redone: "Redone. Undo with ⌘Z.",
    unchanged: "No change.",
    stale: "This text changed elsewhere; the page now shows the current version.",
    failed: "The change was not saved. The page shows the previous text.",
    uncertain:
        "The connection dropped. Check the page and History before trying again.",
    noPage: "This page has no inline-editable text.",
    runLabel: "Editable text. Press Enter to edit.",
    runHint: "Click to edit · Enter saves · Shift+Enter new line · Esc cancels",
    richHint:
        "Click to edit; links and formatting stay in place · Enter saves · Esc cancels",
    linkKept:
        "Keep the link as one linked phrase. Changing the link itself needs the page builder.",
    sharedHint:
        "Site-wide text (header or footer): a change here shows on every page",
    ambiguous:
        "This text appears in more than one field of this block. Edit it in the page builder.",
    changed: "Changed",
    dismiss: "Dismiss",
    imageSaving: "Saving image…",
    imageDropHint: "Click to choose an image, or drop one here",
    imageDropOne: "Drop one image at a time.",
    imageFailed: "The image could not be saved. Please try again.",
    imageCancel: "Cancel upload",
} as const;

/** Changing what an account may manage, from the Users list. A magnet control: it follows the selected row, and every button says how to reach it without a mouse. */
export const permissionsUi = {
    hint: "Select an account to change what it may manage, or to view the site as that member.",
    open: "Permissions",
    openShortcut: "⌥⌘P",
    openTitle: "Change what this account may manage (⌥⌘P)",
    /** The simple control: one box for the one choice most accounts ever need. */
    adminLabel: "Admin",
    adminOn: "Admin: on",
    adminOff: "Admin: off",
    advanced: "…",
    advancedShortcut: "`",
    advancedTitle: "More permissions (` or ⌥⌘P)",
    mimic: "View as member",
    mimicShortcut: "↩",
    mimicTitle: "Open the read-only member view (Enter)",
    mimicRestricted: "A restricted account has no member view.",
    title: "Permissions",
    intro: "Each box saves at once.",
    done: "Done",
    doneShortcut: "⎋",
    self: "Your own permissions can only be changed by another admin.",
    protected:
        "This is the site owner's account. Its permissions stay as they are.",
    on: "on",
    off: "off",
    undo: "Undo",
    undoShortcut: "⌘Z",
    redo: "Redo",
    redoShortcut: "⇧⌘Z",
    failed: "The change was not saved. The account keeps its previous permissions.",
    summary: "May manage:",
    rowLabel: "Select {name} for permissions and the member view",
} as const;

/** Authored section removal shares the inline editor's history and undo controls. */
export const sectionEditUi = {
    activateShortcut: "↵",
    remove: "Remove {name} section",
    removed: "{name} section removed",
    saved: "Section removed. Undo here, with ⌘Z, or from History.",
    restored: "Section restored with its content and images.",
    undo: "Undo removal",
    saving: "Removing…",
    restoring: "Restoring…",
    failed: "The section change was not saved. Please try again.",
    uncertain:
        "The connection dropped. Check the page and History before trying again.",
    stale: "This section changed elsewhere. Review the current page before trying again.",
    loading: "Finding removable sections…",
    historyTitle: "Sections on this page",
    historyIntro:
        "Removed sections keep their content, images and place on the page. Restore brings the whole section back.",
    historyEmpty: "No sections have been removed on this page yet.",
    historyMore: "Show earlier section changes",
    historyFailed: "Section history could not be loaded.",
    retry: "Try again",
    restore: "Restore section",
    alreadyPresent: "Section is on the page",
    historyRemoved: "Removed",
    historyRestored: "Restored",
    you: "you",
    other: "another editor",
} as const;

export const meetingQuestionsUi = {
    dashboardButton: "Questions for KK",
    dashboard: "Back to the admin dashboard",
    groups: {
        start: "Start here",
        optional: "If useful",
        humanitix: "Humanitix ideas — optional; the build is on ice",
    },
    retry: "Retry save",
    refreshFailed: "Saved. The other answers could not be refreshed yet.",
    retryPending:
        "The previous save may have reached the server. Retry it before saving newer changes.",
    title: "Questions for KK · with Sunnie",
    questions: "Questions",
    all: "All meeting questions",
    here: "Questions beside this content",
    context: "See this in context",
    intro: "Choose any question, open its context, and add your answer. Everyone with Admin access can read the answers. Each person edits their own.",
    yourAnswer: "Your answer",
    save: "Save answer",
    saving: "Saving…",
    saved: "Saved for everyone",
    unsaved: "Draft — not saved yet",
    history: "Your answer history",
    useAnswer: "Use this answer",
    formerAdmin: "Former admin",
    emptyAnswer: "Answer cleared",
    conflict:
        "This answer changed in another tab. Your draft is kept. Read the latest saved answer below, then continue with your draft or revise it before saving.",
    keepDraft: "Keep my draft and continue",
    draftKept: "Your draft is kept here.",
    tooLong: "Keep your answer within 4,000 characters.",
    loadFailed: "The questions could not be loaded. Try again.",
    saveFailed: "The answer could not be saved. Try again.",
    loading: "Loading meeting questions…",
    restricted:
        "Sign in with your existing Admin account to read and answer the meeting questions.",
    signIn: "Sign in",
    home: "Back to the site",
    refresh: "Refresh answers",
    empty: "No meeting questions have been added to this site yet.",
    candidates:
        "Choose, combine or reject these directions; they are candidates for discussion.",
    onIce: "Optional Humanitix discussion · implementation is on ice",
    close: "Close questions",
};
