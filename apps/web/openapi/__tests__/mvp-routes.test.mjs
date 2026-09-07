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
    ])
        assert.ok(paths[path]?.get, `${path} GET must be documented`);
    assert.ok(paths["/api/member-billing"].post);
    assert.equal(paths["/api/member-receipts/{invoiceId}"].post, undefined);
    assert.ok(paths["/api/contact-preferences"].put);
    assert.ok(paths["/api/refund-requests/review"].post);
    assert.ok(paths["/api/publication-observations"].post);
    assert.ok(paths["/api/account-closure"].delete);
});
