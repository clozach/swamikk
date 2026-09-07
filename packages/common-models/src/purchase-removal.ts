export type PurchaseRemoval =
    | { kind: "allowed" }
    | {
          kind: "blocked";
          reason: "financial-history" | "live-payment" | "membership-changed";
      };
