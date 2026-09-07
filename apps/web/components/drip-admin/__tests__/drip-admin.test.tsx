import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import DripAdmin from "../drip-admin";
import { dripAdminUi as copy } from "@/config/strings";
import type { DripChange, DripCourseView } from "@courselit/common-models";

const section = {
    id: "one",
    name: "First practice",
    rule: { kind: "relative" as const, delayInMillis: 86400000 },
    publishedLessons: 2,
    draftLessons: 1,
    unknownPublicationDates: 1,
    notification: {
        enabled: true,
        subject: "Practice is ready",
        html: "<p>Hello {{ subscriber.name }}</p>",
    },
};
const change: DripChange = {
    id: "draft-one",
    courseId: "course-one",
    version: 1,
    patch: {
        groupId: "one",
        rule: { kind: "relative", delayInMillis: 0 },
        groupOrder: ["one"],
        notificationEnabled: true,
    },
    preview: {
        before: [section],
        after: [{ ...section, rule: { kind: "relative", delayInMillis: 0 } }],
        impact: {
            activeMembers: 3,
            processingMembers: 1,
            endedPeriods: 2,
            alreadyReleased: 1,
            newlyAvailableNow: 2,
            notificationRecipientsNow: 2,
            notificationSectionIds: ["one"],
            unknownAnchors: 1,
            pendingMessages: 1,
            dispatchingMessages: 0,
            sentMessages: 1,
            uncertainMessages: 0,
            samples: [
                {
                    label: "Current member 1",
                    before: null,
                    after: "2026-09-06T00:00:00.000Z",
                },
            ],
        },
        coursePublished: true,
        evaluatedAt: "2026-09-06T00:00:00.000Z",
        expiresAt: "2026-09-06T00:05:00.000Z",
        effectsHash: "e",
    },
    previewHash: "a".repeat(64),
    preparedBy: "admin-one",
    preparedAt: "2026-09-06T00:00:00.000Z",
    state: { kind: "draft" },
    history: [],
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
};
let course: DripCourseView;
let post: jest.Mock;
function response(value: unknown) {
    return Promise.resolve({ ok: true, json: async () => value });
}
beforeEach(() => {
    course = {
        courseId: "course-one",
        title: "Member practice",
        published: true,
        sections: [section],
        changes: [],
        availabilityChangesRestricted: true,
    };
    post = jest.fn().mockImplementation((body: any) =>
        response({
            change:
                body.action === "approve"
                    ? {
                          ...change,
                          state: {
                              kind: "applied",
                              operationId: "op",
                              approvedBy: "admin-one",
                              at: "2026-09-06T00:01:00.000Z",
                          },
                      }
                    : change,
        }),
    );
    global.fetch = jest
        .fn()
        .mockImplementation((path: string, options: any) => {
            if (options?.method === "POST")
                return post(JSON.parse(options.body));
            return response(
                path.includes("?")
                    ? { course }
                    : {
                          courses: [
                              {
                                  courseId: course.courseId,
                                  title: course.title,
                                  published: true,
                              },
                          ],
                      },
            );
        });
});
afterEach(() => jest.restoreAllMocks());
it.each([
    [true, false, copy.notificationOn, copy.notificationOff],
    [false, true, copy.notificationOff, copy.notificationOn],
])(
    "exposes the saved notification transition %s to %s before approval",
    async (before, after, currentText, proposedText) => {
        const notificationChange: DripChange = {
            ...change,
            patch: {
                ...change.patch,
                rule: section.rule,
                notificationEnabled: after,
            },
            preview: {
                ...change.preview,
                before: [
                    {
                        ...section,
                        notification: {
                            ...section.notification,
                            enabled: before,
                        },
                    },
                ],
                after: [
                    {
                        ...section,
                        notification: {
                            ...section.notification,
                            enabled: after,
                        },
                    },
                ],
            },
        };
        course.changes = [notificationChange];
        await select();
        fireEvent.click(
            screen.getByRole("button", {
                name: /Version 1.*Awaiting approval/,
            }),
        );
        const row = screen.getByRole("row", { name: /1\. First practice/ });
        const cells = within(row).getAllByRole("cell");
        expect(cells[1]).toHaveTextContent(currentText);
        expect(cells[2]).toHaveTextContent(proposedText);
        expect(cells[1]).toHaveTextContent("After a delay: 1 days");
        expect(cells[2]).toHaveTextContent("After a delay: 1 days");
        expect(
            screen.getByRole("button", { name: copy.approve }),
        ).toBeDisabled();
        expect(post).not.toHaveBeenCalled();
    },
);
async function select() {
    render(<DripAdmin />);
    fireEvent.click(
        await screen.findByRole("button", {
            name: /First practice/,
            pressed: false,
        }),
    );
}
it("requires saving an exact review and acknowledgment before approval", async () => {
    await select();
    fireEvent.change(screen.getByLabelText(copy.delay), {
        target: { value: "0" },
    });
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    const approve = await screen.findByRole("button", { name: copy.approve });
    expect(approve).toBeDisabled();
    expect(screen.getByText(copy.retained)).toBeInTheDocument();
    expect(screen.getByTitle(copy.messagePreview)).toHaveAttribute(
        "sandbox",
        "",
    );
    fireEvent.click(screen.getByLabelText(copy.acknowledge));
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    await screen.findByText(copy.applied);
    expect(post).toHaveBeenLastCalledWith({
        action: "approve",
        version: 1,
        previewHash: change.previewHash,
    });
    expect(
        screen.getByRole("button", { name: copy.restore }),
    ).toBeInTheDocument();
});
it("invalidates acknowledgment when controls change after review", async () => {
    course.changes = [change];
    await select();
    fireEvent.click(
        screen.getByRole("button", { name: /Version 1.*Awaiting approval/ }),
    );
    fireEvent.click(screen.getByLabelText(copy.acknowledge));
    fireEvent.change(screen.getByLabelText(copy.delay), {
        target: { value: "3" },
    });
    expect(screen.getByRole("button", { name: copy.approve })).toBeDisabled();
    expect(screen.getByLabelText(copy.acknowledge)).not.toBeChecked();
    expect(screen.getByText(copy.changed)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
});
it("keeps current member availability transitions disabled", async () => {
    await select();
    expect(screen.getByRole("option", { name: copy.available })).toBeDisabled();
    expect(screen.getByText(copy.availabilityRestriction)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: copy.exact })).toBeEnabled();
});
it("offers reconciliation for uncertain outcomes instead of another approval", async () => {
    course.changes = [
        {
            ...change,
            state: {
                kind: "uncertain",
                operationId: "op",
                approvedBy: "admin-one",
                at: "2026-09-06T00:01:00.000Z",
            },
        },
    ];
    await select();
    fireEvent.click(
        screen.getByRole("button", {
            name: /Version 1.*Result needs checking/,
        }),
    );
    expect(
        screen.queryByRole("button", { name: copy.approve }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.reconcile }));
    await waitFor(() =>
        expect(post).toHaveBeenCalledWith({ action: "reconcile" }),
    );
});
it("requires a new review when approval returns stale", async () => {
    post.mockImplementation(() =>
        response({
            change: { ...change, state: { kind: "stale", reason: "Changed" } },
        }),
    );
    await select();
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    await screen.findByText(copy.stale);
    expect(
        screen.queryByRole("button", { name: copy.approve }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole("button", { name: copy.refresh }),
    ).toBeInTheDocument();
});
