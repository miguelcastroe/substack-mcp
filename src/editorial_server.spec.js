import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {tools, editorialTools} from "./editorial_server.js";

describe("editorial MCP server", () => {
  test("keeps all base tools and adds the editorial layer", () => {
    assert.deepEqual(Object.keys(editorialTools).sort(), [
      "archive_intelligence",
      "editorial_context",
      "prepare_draft",
      "seo_audit",
    ]);

    assert.ok(tools.create_draft_post);
    assert.ok(tools.list_posts);
    assert.ok(tools.get_post_stats);
    assert.ok(tools.publish_draft);
    assert.ok(tools.editorial_context);
    assert.ok(tools.archive_intelligence);
    assert.ok(tools.seo_audit);
    assert.ok(tools.prepare_draft);
  });
});
