import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {editorialContextHandler} from "./editorial_context.js";
import {archiveIntelligenceHandler} from "./archive_intelligence.js";
import {seoAuditHandler} from "./seo_audit.js";
import {prepareDraftHandler} from "./prepare_draft.js";

describe("editorial_context", () => {
  test("combines topic matches with performance benchmarks", async () => {
    const statuses = [];
    const result = await editorialContextHandler(
      {topic: "creative AI", archive_limit: 3, benchmark_limit: 2},
      {
        listPosts: async ({status, search}) => {
          statuses.push(status);
          return {total: 1, posts: [{id: status === "published" ? 1 : 2, title: `${search} ${status}`}]};
        },
        getPostStats: async ({order_by}) => ({
          posts: [{post_id: 9, title: "Leader", [order_by]: 10}],
        }),
      }
    );

    assert.deepEqual(statuses.sort(), ["drafts", "published"]);
    assert.equal(result.archive.published_matches.length, 1);
    assert.equal(result.archive.draft_matches.length, 1);
    assert.deepEqual(Object.keys(result.performance_benchmarks).sort(), [
      "estimated_value",
      "signups",
      "subscribers_finished_post",
      "unsubscribes",
    ]);
  });
});

describe("archive_intelligence", () => {
  test("finds posts that recur across metric leaderboards", async () => {
    const result = await archiveIntelligenceHandler(
      {metrics: ["signups", "views", "shares"], limit: 2},
      {
        getPostStats: async ({order_by}) => ({
          posts: [
            {post_id: 1, title: "Recurring", [order_by]: 100},
            {post_id: order_by === "signups" ? 2 : 3, title: "Other", [order_by]: 50},
          ],
        }),
      }
    );

    assert.equal(result.recurring_leaders[0].post_id, 1);
    assert.equal(result.recurring_leaders[0].metrics_present, 3);
    assert.deepEqual(result.recurring_leaders[0].ranks, {signups: 1, views: 1, shares: 1});
  });
});

describe("seo_audit", () => {
  test("audits metadata and an optional focus phrase without inventing an SEO score", async () => {
    const body = JSON.stringify({
      type: "doc",
      content: [
        {type: "paragraph", content: [{type: "text", text: "Creative AI changes how ideas are developed."}]},
      ],
    });

    const result = await seoAuditHandler(
      {draft_id: 42, focus_phrase: "creative ai"},
      {
        getDraft: async () => ({
          draft_title: "Creative AI and the work behind ideas",
          draft_subtitle: "A practical argument",
          search_engine_title: "Creative AI and the work behind ideas",
          search_engine_description:
            "A practical look at how creative AI changes the work behind stronger ideas without reducing creativity to automation.",
          social_title: "Creative AI and the work behind ideas",
          description: "Why the work behind ideas is changing.",
          slug: "creative-ai-work-behind-ideas",
          cover_image: "https://substackcdn.com/image.jpg",
          draft_body: body,
        }),
        getPostTags: async () => ({tags: [{name: "AI"}, {name: "Creativity"}]}),
      }
    );

    assert.deepEqual(result.warnings, []);
    assert.equal(result.focus_phrase.in_post_title, true);
    assert.equal(result.focus_phrase.in_body, true);
    assert.equal(result.ready_for_editorial_review, true);
  });
});

describe("prepare_draft", () => {
  test("creates, configures and tags a draft without publishing", async () => {
    const calls = [];
    const result = await prepareDraftHandler(
      {
        title: "An article",
        subtitle: "A subtitle",
        body: "First paragraph",
        audience: "everyone",
        search_engine_title: "An article",
        search_engine_description:
          "A complete description that is long enough to be useful as search metadata for this article.",
        slug: "an-article",
        tags: ["Ideas", "AI"],
      },
      {
        createDraft: async (args) => {
          calls.push(["create", args]);
          return {draft_id: 123, is_published: false};
        },
        updateDraft: async (args) => {
          calls.push(["update", args]);
          return {updated_fields: ["audience", "search_engine_title", "search_engine_description", "slug"]};
        },
        addTag: async (args) => {
          calls.push(["tag", args]);
          return {status: "tagged", tag: {name: args.tag_name}};
        },
      }
    );

    assert.equal(result.draft_id, 123);
    assert.equal(result.published, false);
    assert.equal(result.email_sent, false);
    assert.equal(calls.filter(([type]) => type === "tag").length, 2);
    assert.equal(calls.some(([type]) => type === "publish"), false);
  });

  test("preserves the created draft id when a later preparation step fails", async () => {
    await assert.rejects(
      () =>
        prepareDraftHandler(
          {title: "An article", body: "Body", tags: ["Typo"]},
          {
            createDraft: async () => ({draft_id: 987}),
            addTag: async () => {
              throw new Error("tag failed");
            },
          }
        ),
      /draft 987.*preserved/i
    );
  });
});
