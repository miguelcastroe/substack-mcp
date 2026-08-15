#!/usr/bin/env node

import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {createServer} from "./editorial_server.js";
import {logger, logOutgoingMessages} from "./logger.js";

const REQUIRED_ENV = ["SUBSTACK_PUBLICATION_URL", "SUBSTACK_SESSION_TOKEN", "SUBSTACK_USER_ID"];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  logger.error("server.env.missing", {missing: missingEnv});
  throw new Error("SUBSTACK_PUBLICATION_URL, SUBSTACK_SESSION_TOKEN and SUBSTACK_USER_ID must be set");
}

logger.info("server.starting", {
  mode: "editorial",
  publication_url: process.env.SUBSTACK_PUBLICATION_URL,
  user_id: process.env.SUBSTACK_USER_ID,
  log_level: process.env.SUBSTACK_MCP_LOG_LEVEL || "info",
  node: process.version,
});

const server = createServer();
const transport = logOutgoingMessages(new StdioServerTransport());

server.connect(transport).then(
  () => logger.info("server.ready", {transport: "stdio", mode: "editorial"}),
  (error) => {
    logger.error("server.connect.failed", {error, mode: "editorial"});
    process.exit(1);
  }
);
