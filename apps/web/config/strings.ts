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
    send: "Send comment",
    sending: "Sending…",
    sent: "Comment received. Thank you — the support team can now review it.",
    photo: "Attach a photo (admin)",
    copy: "Copy page prompt",
    copied: "Page feedback copied. Paste it into your development chat.",
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
    guide: "Hold Ctrl or ⌘. Add comments for the model. Copy the page prompt. Paste it into your development chat.",
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
    savedPrompt: "Development prompt",
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
    readOnly: "Read-only member view",
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
        "Exit Mimic before changing account details or sending anything.",
};
export { mediaPlayerUi, catalogMediaUi } from "@courselit/common-models";
