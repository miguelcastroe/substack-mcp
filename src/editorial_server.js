import {readFileSync} from "node:fs";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {tools as baseTools} from "./server.js";
import {editorialContextSchema, editorialContextHandler} from "./tools/editorial_context.js";
import {archiveIntelligenceSchema, archiveIntelligenceHandler} from "./tools/archive_intelligence.js";
import {seoAuditSchema, seoAuditHandler} from "./tools/seo_audit.js";
import {prepareDraftSchema, prepareDraftHandler} from "./tools/prepare_draft.js";
import {logger} from "./logger.js";

const {version} = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const editorialTools = {
  editorial_context: {
    description:
      "Build topic-specific editorial context from your own archive before writing: search published posts and drafts, then return performance benchmarks for acquisition, completion, value and churn. It gathers evidence; the calling model makes the editorial judgement.",
    schema: editorialContextSchema,
    handler: editorialContextHandler,
  },
  archive_intelligence: {
    description:
      "Compare posts across several performance dimensions and identify cross-metric recurrence. Positive and adverse signals are labelled separately, so a post ranking high for acquisition and churn is surfaced as something to investigate rather than called a winner.",
    schema: archiveIntelligenceSchema,
    handler: archiveIntelligenceHandler,
  },
  seo_audit: {
    description:
      "Audit a draft's deterministic SEO and distribution metadata: explicit SEO title and description, slug hygiene, cover, social metadata, tags, body presence and an optional focus phrase. It does not research search intent or competitors; do that externally with a search-capable client.",
    schema: seoAuditSchema,
    handler: seoAuditHandler,
  },
  prepare_draft: {
    description:
      "Create a Substack draft and prepare its post settings, SEO metadata, social metadata and tags in one operation. Structured Substack document JSON is accepted as the body. This tool never publishes and never sends email; publish_draft remains a separate explicit action.",
    schema: prepareDraftSchema,
    handler: prepareDraftHandler,
  },
};

export const tools = {...baseTools, ...editorialTools};

export function createServer() {
  const server = new McpServer({name: "Substack Editorial MCP", version});

  for (const [name, {description, schema, handler}] of Object.entries(tools)) {
    server.registerTool(name, {description, inputSchema: schema}, async (args) => {
      const startedAt = Date.now();
      logger.info("tool.call.start", {tool: name, args});

      try {
        const result = await handler(args);
        logger.info("tool.call.success", {tool: name, duration_ms: Date.now() - startedAt, result});
        return {content: [{type: "text", text: JSON.stringify(result, null, 2)}]};
      } catch (error) {
        logger.error("tool.call.error", {tool: name, duration_ms: Date.now() - startedAt, error});
        throw error;
      }
    });

    logger.info("tool.registered", {tool: name, description});
  }

  return server;
}
