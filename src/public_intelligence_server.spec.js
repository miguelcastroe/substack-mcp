import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {publicIntelligenceTools} from "./public_intelligence_server.js";

describe("Substack Intelligence public tool surface", () => {
  test("exposes only public editorial reads", () => {
    assert.deepEqual(Object.keys(publicIntelligenceTools), ["public_editorial_archive"]);
  });

  test("marks the public tool as read-only and open-world", () => {
    const tool = publicIntelligenceTools.public_editorial_archive;
    assert.deepEqual(tool.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
  });
});
