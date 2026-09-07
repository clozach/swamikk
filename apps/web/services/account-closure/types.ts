export interface AccountClosureReview {
    kind: "review";
    blockers: {
        kind: "membership" | "financial" | "owner" | "checkout";
        message: string;
        href: string;
    }[];
    reviewHash: string;
    state: "active" | "closing" | "erasing" | "erased";
    pendingWrites: number;
    recentIdentity: boolean;
}
