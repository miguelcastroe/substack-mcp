import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {intelligenceTools, READ_ONLY_BASE_TOOL_NAMES} from "./intelligence_server.js";
import {substackLandscapeHandler} from "./tools/substack_landscape.js";

const FORBIDDEN_WRITE_TOOLS = [
  "create_draft_post",
  "set_post_body",
  "upload_image",
  "update_draft",
  "publish_draft",
  "delete_draft",
  "add_tag_to_post",
  "comment_on_post",
  "restack_item",
  "prepare_draft",
];

describe("Substack Intelligence tool surface", () => {
  test("contains only the intended base read tools plus intelligence composites", () => {
    for (const name of READ_ONLY_BASE_TOOL_NAMES) {
      assert.ok(intelligenceTools[name], `${name} should be exposed`);
    }

    assert.ok(intelligenceTools.substack_landscape);
    assert.ok(intelligenceTools.editorial_context);
    assert.ok(intelligenceTools.archive_intelligence);
    assert.ok(intelligenceTools.seo_audit);
  });

  test("does not expose any publishing or mutation tool", () => {
    for (const name of FORBIDDEN_WRITE_TOOLS) {
      assert.equal(intelligenceTools[name], undefined, `${name} must not be exposed`);
    }
  });

  test("does not expose subscriber-level PII exports in the first read-only surface", () => {
    assert.equal(intelligenceTools.list_subscribers, undefined);
    assert.equal(intelligenceTools.export_subscribers, undefined);
  });
});

describe("substack_landscape", () => {
  test("combines subscriptions, inbox and both personalized feed surfaces", async () => {
    const calls = [];
    const result = await substackLandscapeHandler(
      {inbox_limit: 12, feed_limit: 8, subscriptions_limit: 30, include_for_you: true},
      {
        listSubscriptions: async (args) => {
          calls.push(["subscriptions", args]);
          return {returned: 1, subscriptions: [{name: "A Publication"}]};
        },
        listReaderPosts: async (args) => {
          calls.push(["inbox", args]);
          return {returned: 1, posts: [{title: "A Post"}]};
        },
        getReaderFeed: async (args) => {
          calls.push(["feed", args]);
          return {tab: args.tab, returned: 1, items: []};
        },
      }
    );

    assert.equal(result.scope, "personal_substack_ecosystem");
    assert.equal(result.subscriptions.returned, 1);
    assert.equal(result.inbox.returned, 1);
    assert.equal(result.feeds.subscribed.tab, "subscribed");
    assert.equal(result.feeds.for_you.tab, "for-you");
    assert.equal(calls.filter(([type]) => type === "feed").length, 2);
  });

  test("can omit the for-you feed", async () => {
    let feedCalls = 0;
    const result = await substackLandscapeHandler(
      {include_for_you: false},
      {
        listSubscriptions: async () => ({returned: 0, subscriptions: []}),
        listReaderPosts: async () => ({returned: 0, posts: []}),
        getReaderFeed: async ({tab}) => {
          feedCalls += 1;
          return {tab, returned: 0, items: []};
        },
      }
    );

    assert.equal(feedCalls, 1);
    assert.equal(result.feeds.subscribed.tab, "subscribed");
    assert.equal(result.feeds.for_you, undefined);
  });
});
