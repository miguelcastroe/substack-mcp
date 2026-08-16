import {readFileSync} from "node:fs";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  publicEditorialArchiveSchema,
  publicEditorialArchiveHandler,
} from "./tools/public_editorial_archive.js";
import {logger} from "./logger.js";

const {version} = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};

export const publicIntelligenceTools = {
  public_editorial_archive: {
    description:
      "Read a public Substack publication as an editorial corpus. Scans the publication archive, returns normalized post metadata, and can hydrate each post with the public body Substack exposes without a subscriber session. Use it to compare themes, recurring arguments, connections and editorial gaps. Paid posts may return only their public preview. Read-only and does not require access to the publication owner's account.",
    schema: publicEditorialArchiveSchema,
    handler: publicEditorialArchiveHandler,
    annotations: READ_ONLY_ANNOTATIONS,
  },
};

export function createPublicIntelligenceServer() {
  const server = new McpServer({name: "Substack Intelligence Public", version});

  for (const [name, {description, schema, handler, annotations}] of Object.entries(publicIntelligenceTools)) {
    server.registerTool(
      name,
      {description, inputSchema: schema, annotations},
      async (args) => {
        const startedAt = Date.now();
        logger.info("public_intelligence.tool.call.start", {tool: name});

        try {
          const result = await handler(args);
          logger.info("public_intelligence.tool.call.success", {
            tool: name,
            duration_ms: Date.now() - startedAt,
          });
          return {content: [{type: "text", text: JSON.stringify(result, null, 2)}]};
        } catch (error) {
          logger.error("public_intelligence.tool.call.error", {
            tool: name,
            duration_ms: Date.now() - startedAt,
            error,
          });
          throw error;
        }
      }
    );
  }

  return server;
}
