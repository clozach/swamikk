import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenApiRoutes } from "../index.mjs";
test("the assembled API includes feedback delivery, cancellation and read-only receipts", () => {
    const { paths } = buildOpenApiRoutes();
    for (const path of [
        "/api/feedback-mailbox",
        "/api/member-billing",
        "/api/member-receipts/{invoiceId}",
        "/api/drip-admin",
        "/api/drip-admin/{id}",
        "/api/contact-preferences",
        "/api/contact-preferences/photo",
        "/api/refund-requests",
        "/api/refund-requests/review",
        "/api/publication-observations",
        "/api/account-closure",
        "/api/content-changes/page-widget",
        "/api/class-checkout",
        "/api/class-checkout/status",
    ])
        assert.ok(paths[path]?.get, `${path} GET must be documented`);
    assert.ok(paths["/api/member-billing"].post);
    assert.equal(paths["/api/member-receipts/{invoiceId}"].post, undefined);
    assert.ok(paths["/api/contact-preferences"].put);
    assert.ok(paths["/api/refund-requests/review"].post);
    assert.ok(paths["/api/publication-observations"].post);
    assert.ok(paths["/api/account-closure"].delete);
});

test("public class choices and private checkout status retain separate authority", () => {
    const { paths } = buildOpenApiRoutes();
    assert.deepEqual(paths["/api/class-checkout"].get.security, []);
    assert.deepEqual(paths["/api/class-checkout/status"].get.security, [
        { CourseLitSession: [] },
    ]);
    assert.equal(paths["/api/class-checkout/status"].post, undefined);
});

test("reviewer authority stays separate from administrator session routes", () => {
    const { paths, components } = buildOpenApiRoutes();
    assert.equal(components.securitySchemes.feedbackReviewer.scheme, "bearer");
    for (const operation of ["claim", "context", "result"]) {
        assert.deepEqual(
            paths[`/api/feedback-review/${operation}`].post.security,
            [{ feedbackReviewer: [] }],
        );
    }
    assert.deepEqual(paths["/api/feedback-review/grants"].post.security, [
        { CourseLitSession: [] },
    ]);
    assert.deepEqual(paths["/api/feedback-review/grants/{id}"].post.security, [
        { CourseLitSession: [] },
    ]);
});
