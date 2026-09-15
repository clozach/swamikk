/**
 * Editing a member's record from Member Mimic.
 *
 * An admin viewing a member through Member Mimic may change a bounded set of
 * that member's fields. The edit runs under the admin's own session: the
 * editor recorded on every row is the ADMIN (`ctx.actor` inside a mimic
 * context), never the projected member. Every edit, undo and restore is an
 * append-only `MemberEdit` row carrying the exact before and after of each
 * field and, for a reversal, the row it reverses (`undoOf`); original values
 * stay fixed while lifecycle and email delivery status settle. Sign-in email is the consequence-bearing field: a
 * brand-new address must first prove it receives mail (a code), while an
 * address the account already held needs no code — which is how undo and
 * restore work for email.
 */
export type MemberEditField =
    /** `User.name` — what the member is called. */
    | "name"
    /** `User.email` — the sign-in identity; verified path, see above. */
    | "email"
    /** `ContactPreferences.contact.kind` — email, voice or text. */
    | "contact.kind"
    /** `ContactPreferences.contact.value` — the address or number for that kind. */
    | "contact.value"
    /** `ContactPreferences.checkIns` — none or occasional. */
    | "checkIns";

export const MEMBER_EDIT_FIELDS: readonly MemberEditField[] = [
    "name",
    "email",
    "contact.kind",
    "contact.value",
    "checkIns",
];

export type MemberContactKind = "email" | "voice" | "text";
export type MemberCheckIns = "none" | "occasional";

/** One field of one member, replaced whole; `before` is the exact current value. */
export interface MemberEditChange {
    field: MemberEditField;
    before: string;
    after: string;
}

export interface MemberEditInput {
    /** One row family: name alone, email alone, or up to three contact/check-in fields. */
    changes: MemberEditChange[];
    /** The edit this one reverses (an undo, a redo, or a restore from History). */
    undoOf?: string;
}

/** Who made an edit — resolved on read for display, never copied onto the row. */
export interface MemberEditActor {
    userId: string;
    name: string;
    email: string;
}

export type MemberEmailVerification =
    /** A six-digit code sent to the new address was entered. */
    | { kind: "code-to-new-address" }
    /** The account held this address before (the current one, or a `before` of an applied email row). */
    | { kind: "previously-held" };

export interface MemberEdit {
    editId: string;
    subjectUserId: string;
    editorUserId: string;
    editor?: MemberEditActor;
    /** The Member Mimic view the edit was made from. */
    mimicId: string;
    at: string;
    changes: MemberEditChange[];
    undoOf?: string;
    /** Present on applied email changes only. */
    emailVerification?: MemberEmailVerification;
    /** Email side effects remain retryable until sessions are revoked and the notice is accepted. */
    emailEffects?: "pending" | "complete";
}

/** An email change waiting for its code. Never carries the code or its hash. */
export interface MemberEmailPending {
    pendingId: string;
    /** The proposed new sign-in address, as it will be stored. */
    email: string;
    expiresAt: string;
    undoOf?: string;
}

/** Everything the edit panel shows, read fresh from the database. */
export interface MemberEditSnapshot {
    subject: { userId: string; name: string; email: string };
    contact: {
        kind: MemberContactKind;
        value: string;
        checkIns: MemberCheckIns;
        /** 0 when the member has no stored preferences yet (defaults shown). */
        revision: number;
    };
    /** Why the sign-in email cannot be changed for this member, when it cannot. */
    emailLock?: "self" | "owner";
    actor: { userId: string; name: string; canReviewRefunds: boolean };
    pendingEmail?: MemberEmailPending;
    /** An applied change still has a durable notice/session-revocation receipt. */
    emailEffects?: "pending";
}

export type MemberEditResult =
    | { kind: "applied"; edit: MemberEdit; snapshot: MemberEditSnapshot }
    | {
          kind: "stale";
          /** The stored value of every change whose `before` no longer matches. */
          current: Array<{ field: MemberEditField; value: string }>;
          message: string;
      }
    /** An email change to a never-held address: a code has been sent; confirm it. */
    | {
          kind: "verify";
          pending: MemberEmailPending;
          snapshot: MemberEditSnapshot;
      };

export type MemberEmailInput =
    | { action: "confirm"; pendingId: string; code: string }
    | { action: "resend"; pendingId: string }
    | { action: "cancel"; pendingId: string };

export type MemberEmailResult =
    | { kind: "applied"; edit: MemberEdit; snapshot: MemberEditSnapshot }
    | { kind: "wrong-code"; attemptsLeft: number }
    /** The code expired or the attempts ran out; propose the change again. */
    | { kind: "expired"; snapshot: MemberEditSnapshot }
    | { kind: "cancelled"; snapshot: MemberEditSnapshot }
    | { kind: "resent"; pending: MemberEmailPending };

export interface MemberEditHistory {
    edits: MemberEdit[];
    nextCursor: string | null;
}

/**
 * Row lifecycle: `pending` (an email change awaiting its code) → `applying`
 * (written just before the record write) → `applied` | `failed`. Only
 * `applied` rows are history.
 */
export type MemberEditState = "pending" | "applying" | "applied" | "failed";
