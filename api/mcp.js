import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {createIntelligenceServer} from "../src/intelligence_server.js";

const REQUIRED_ENV = [
  "SUBSTACK_PUBLICATION_URL",
  "SUBSTACK_SESSION_TOKEN",
  "SUBSTACK_USER_ID",
  "SUBSTACK_MCP_BEARER_TOKEN",
];

function unauthorized(response) {
  response.setHeader("WWW-Authenticate", "Bearer");
  response.status(401).json({error: "unauthorized"});
}

export default async function handler(request, response) {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    // Never include secret values. Naming missing variables is safe and makes deployment failures diagnosable.
    response.status(503).json({error: "server_not_configured", missing});
    return;
  }

  const expected = `Bearer ${process.env.SUBSTACK_MCP_BEARER_TOKEN}`;
  if (request.headers.authorization !== expected) {
    unauthorized(response);
    return;
  }

  if (!["GET", "POST", "DELETE"].includes(request.method ?? "")) {
    response.setHeader("Allow", "GET, POST, DELETE");
    response.status(405).json({error: "method_not_allowed"});
    return;
  }

  const server = createIntelligenceServer();
  const transport = new StreamableHTTPServerTransport({
    // Stateless mode is a better fit for horizontally scaled Vercel Functions and this server
    // has no server-initiated requests or resumability requirements.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await transport.close();
    } catch {}
    try {
      await server.close();
    } catch {}
  };

  response.on("close", close);

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    if (!response.headersSent) {
      response.status(500).json({error: "mcp_request_failed"});
    }
    throw error;
  }
}
