import { render, screen, within } from "@testing-library/react";
import OverviewSummary from "../summary";
import AttentionList from "../attention-list";
import Diagnostics from "../diagnostics";
import { Actors, snapshot } from "./fixture";
import { attentionLabels } from "../copy";
jest.mock("next/navigation", () => ({
    usePathname: () => "/dashboard/overview",
}));

it.each(["unavailable", "limited"] as const)(
    "does not display partial refund totals as complete when a source is %s",
    (state) => {
        const view = {
            ...snapshot,
            sources: snapshot.sources.map((source) =>
                source.source === "refunds"
                    ? {
                          ...source,
                          state:
                              state === "unavailable"
                                  ? ("unavailable" as const)
                                  : ("available" as const),
                          limited: state === "limited",
                      }
                    : source,
            ),
        };
        render(
            <Actors>
                <OverviewSummary view={view} />
                <AttentionList view={view} />
                <Diagnostics view={view} expanded />
            </Actors>,
        );
        const testCard = screen.getByText("Test payments · NZD").closest("li")!;
        expect(within(testCard).getByText("Unavailable")).toBeVisible();
        expect(within(testCard).getAllByText(/NZD\s9\.00/)).toHaveLength(1);
        expect(
            screen.getByText(/Some checks are unavailable or limited/),
        ).toBeVisible();
        const sourceRow = screen.getByRole("row", {
            name: /Refund observations/,
        });
        expect(sourceRow).toHaveTextContent(
            state === "unavailable"
                ? "Unavailable — no count"
                : "1 loaded — limited",
        );
    },
);

it("keeps a failed receipts read distinct from a verified empty period", () => {
    render(
        <Actors>
            <OverviewSummary
                view={{
                    ...snapshot,
                    payments: [],
                    sources: snapshot.sources.map((source) =>
                        source.source === "payments"
                            ? { ...source, state: "unavailable" }
                            : source,
                    ),
                }}
            />
        </Actors>,
    );
    expect(
        screen.getByText("Unavailable: paid receipts could not be read."),
    ).toBeVisible();
    expect(screen.queryByText(/No dated paid receipts/)).toBeNull();
});

it("keeps measured processing, release-evidence review and inferred missed access distinct; members open Mimic with a safe return", () => {
    const kinds = [
        "access-processing",
        "retention-review",
        "paid-access-review",
    ] as const;
    const view = {
        ...snapshot,
        attention: kinds.map((kind, i) => ({
            diagnosticId: `diag-${i}`,
            source: "access" as const,
            kind,
            state: "needs review",
            recordedAt: snapshot.generatedAt,
            href: "/dashboard/support",
            member: { label: `Member ${i}`, userId: "member-one" },
        })),
        attentionTotal: 3,
    };
    render(
        <Actors>
            <AttentionList view={view} />
        </Actors>,
    );
    for (const kind of kinds)
        expect(
            screen.getByRole("heading", { name: attentionLabels[kind][0] }),
        ).toBeVisible();
    const link = screen.getByRole("link", { name: "Member 0" });
    const href = new URL(link.getAttribute("href")!, window.location.origin);
    expect(href.pathname).toBe("/dashboard/users/member-one");
    expect(href.searchParams.get("returnTo")).toBe("/dashboard/overview");
    expect(screen.queryByRole("button")).toBeNull();
});

it("settings-only admins see no inaccessible member, transaction or content links", () => {
    render(
        <Actors permissions={["setting:manage"]}>
            <OverviewSummary view={snapshot} />
            <AttentionList
                view={{
                    ...snapshot,
                    attention: [
                        {
                            diagnosticId: "diag",
                            source: "access",
                            kind: "access-processing",
                            state: "prepared",
                            recordedAt: null,
                            member: { label: "Member hidden" },
                            href: "/dashboard/changes",
                        },
                    ],
                }}
            />
        </Actors>,
    );
    expect(screen.getByText("Member hidden")).toBeVisible();
    for (const name of [
        "Open members",
        "Open transactions",
        "Open products",
        "Open related records",
        "Member hidden",
    ])
        expect(screen.queryByRole("link", { name })).toBeNull();
    expect(
        screen.getByRole("link", { name: "Inspect diagnostics" }),
    ).toBeVisible();
});
