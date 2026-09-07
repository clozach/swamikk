export interface MemberMimicIdentity {
    userId: string;
    name: string;
    email: string;
}

export type MemberMimicView =
    | { kind: "inactive" }
    | { kind: "expired"; returnTo: string }
    | {
          kind: "active";
          subject: MemberMimicIdentity;
          actor: MemberMimicIdentity;
          expiresAt: string;
          returnTo: string;
      };

export type MemberMimicRecordState =
    | { kind: "active" }
    | { kind: "revoked"; at: string; by: string };

export interface MemberMimicRecord {
    id: string;
    tokenHash: string;
    actorUserId: string;
    actorSessionHash: string;
    subjectUserId: string;
    returnTo: string;
    state: MemberMimicRecordState;
    createdAt: Date;
    expiresAt: Date;
    deleteAfter: Date;
}

export interface MemberMimicInput {
    userId: string;
    returnTo?: string;
}

export interface MemberMimicContext {
    id: string;
    actorUserId: string;
    subjectUserId: string;
    expiresAt: string;
}

export interface MemberMimicRouteParams {
    params: Promise<{ id: string }>;
}

export type MemberMimicResolution<TContext> =
    | {
          kind: "ordinary";
          context: TContext;
          view: Extract<MemberMimicView, { kind: "inactive" }>;
      }
    | {
          kind: "mimic";
          context: TContext;
          view: Extract<MemberMimicView, { kind: "active" }>;
      }
    | { kind: "expired"; view: Extract<MemberMimicView, { kind: "expired" }> };

export interface MemberMimicStartResult {
    token: string;
    view: Extract<MemberMimicView, { kind: "active" }>;
}
