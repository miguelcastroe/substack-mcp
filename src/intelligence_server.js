import {readFileSync} from "node:fs";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {tools as baseTools} from "./server.js";
import {editorialContextSchema, editorialContextHandler} from "./tools/editorial_context.js";
import {editorialArchiveSchema, editorialArchiveHandler} from "./tools/editorial_archive.js";
import {archiveIntelligenceSchema, archiveIntelligenceHandler} from "./tools/archive_intelligence.js";
import {seoAuditSchema, seoAuditHandler} from "./tools/seo_audit.js";
import {substackLandscapeSchema, substackLandscapeHandler} from "./tools/substack_landscape.js";
import {logger} from "./logger.js";

const {version} = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const READ_ONLY_BASE_TOOL_NAMES = [
  "list_posts",
  "get_draft",
  "get_publication",
  "get_user_profile",
  "list_publication_tags",
  "get_post_tags",
  "get_post_comments",
  "list_subscriptions",
  "list_reader_posts",
  "get_reader_post",
  "get_reader_feed",
  "get_profile_feed",
  "get_comment_thread",
  "get_publication_stats",
  "get_post_stats",
  "get_analytics",
];

const readOnlyBaseTools = Object.fromEntries(
  READ_ONLY_BASE_TOOL_NAMES.map((name) => {
    const tool = baseTools[name];
    if (!tool) throw new Error(`Read-only tool ${name} is missing from the base server`);
    return [name, tool];
  })
);

export const intelligenceTools = {
  ...readOnlyBaseTools,
  substack_landscape: {
    description:
      "Read the account's personalized Substack landscape in one call: active subscriptions, recent subscribed-post Inbox entries, the subscribed feed and optionally the for-you feed. Use it to identify who is publishing, recurring themes and emerging signals. This is personalized context, not a global search of all Substack.",
    schema: substackLandscapeSchema,
    handler: substackLandscapeHandler,
  },
  editorial_archive: {
    description:
      "Build a normalized editorial corpus in one call by scanning the user's profile, keeping published posts from the configured publication, optionally including the user's Notes, and hydrating matching posts with their complete readable bodies. Follows profile pagination internally and returns a continuation cursor only when the archive exceeds the scan budget. Read-only.",
    schema: editorialArchiveSchema,
    handler: editorialArchiveHandler,
  },
  editorial_context: {
    description:
      "Build topic-specific context from your own publication: find related published posts and drafts and add performance benchmarks for acquisition, completion, value and churn. Read-only; the calling model makes the editorial judgement.",
    schema: editorialContextSchema,
    handler: editorialContextHandler,
  },
  archive_intelligence: {
    description:
      "Compare your publication's post rankings across selected KPI dimensions and identify cross-metric recurrence, including adverse churn signals. Read-only and evidence-oriented.",
    schema: archiveIntelligenceSchema,
    handler: archiveIntelligenceHandler,
  },
  seo_audit: {
    description:
      "Read a draft and audit its deterministic SEO/distribution metadata without changing it. Useful for inspection, but this server exposes no draft-writing or publishing tools.",
    schema: seoAuditSchema,
    handler: seoAuditHandler,
  },
};

export function createIntelligenceServer() {
  const server = new McpServer({name: "Substack Intelligence", version});

  for (const [name, {description, schema, handler}] of Object.entries(intelligenceTools)) {
    server.registerTool(name, {description, inputSchema: schema}, async (args) => {
      const startedAt = Date.now();
      logger.info("intelligence.tool.call.start", {tool: name, args});

      try {
        const result = await handler(args);
        // Do not log tool results here. Reader posts, drafts and analytics may contain private
        // publication data; remote hosting logs should carry operational metadata, not content.
        logger.info("intelligence.tool.call.success", {
          tool: name,
          duration_ms: Date.now() - startedAt,
        });
        return {content: [{type: "text", text: JSON.stringify(result, null, 2)}]};
      } catch (error) {
        logger.error("intelligence.tool.call.error", {
          tool: name,
          duration_ms: Date.now() - startedAt,
          error,
        });
        throw error;
      }
    });
  }

  return server;
}
