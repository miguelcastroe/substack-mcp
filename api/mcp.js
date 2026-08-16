import {WebStandardStreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {createIntelligenceServer} from "../src/intelligence_server.js";

const REQUIRED_ENV = [
  "SUBSTACK_PUBLICATION_URL",
  "SUBSTACK_SESSION_TOKEN",
  "SUBSTACK_USER_ID",
  "SUBSTACK_MCP_BEARER_TOKEN",
];

function copyHeaders(nodeHeaders = {}) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, String(item));
    } else {
      headers.set(name, String(value));
    }
  }

  return headers;
}

function toWebRequest(request) {
  const method = request.method ?? "GET";
  const headers = copyHeaders(request.headers);
  const protocol = headers.get("x-forwarded-proto") ?? "https";
  const host = headers.get("host") ?? "localhost";
  const url = new URL(request.url ?? "/api/mcp", `${protocol}://${host}`);

  // Vercel parses JSON request bodies before invoking a Node Function. The web-standard MCP
  // transport accepts that body separately, so the Request itself does not need to replay a
  // consumed Node stream.
  return new Request(url, {method, headers});
}

async function writeWebResponse(webResponse, response) {
  response.status(webResponse.status);

  for (const [name, value] of webResponse.headers.entries()) {
    response.setHeader(name, value);
  }

  const body = Buffer.from(await webResponse.arrayBuffer());
  response.end(body);
}

function jsonResponse(response, status, body, extraHeaders = {}) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.end(Buffer.from(JSON.stringify(body)));
}

export default async function handler(request, response) {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    jsonResponse(response, 503, {error: "server_not_configured", missing});
    return;
  }

  const expected = `Bearer ${process.env.SUBSTACK_MCP_BEARER_TOKEN}`;
  if (request.headers.authorization !== expected) {
    jsonResponse(response, 401, {error: "unauthorized"}, {"WWW-Authenticate": "Bearer"});
    return;
  }

  if (!["GET", "POST", "DELETE"].includes(request.method ?? "")) {
    jsonResponse(response, 405, {error: "method_not_allowed"}, {Allow: "GET, POST, DELETE"});
    return;
  }

  const server = createIntelligenceServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Fresh server + fresh transport per HTTP request: safe for horizontally scaled Vercel
    // Functions and sufficient for this read-only request/response tool surface.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Keep transport errors operational only. Never log MCP request or result bodies here.
  transport.onerror = (error) => {
    console.error("substack_intelligence.mcp_transport_error", error?.message ?? String(error));
  };

  try {
    await server.connect(transport);
    const webRequest = toWebRequest(request);
    const webResponse = await transport.handleRequest(webRequest, {
      parsedBody: request.body,
    });
    await writeWebResponse(webResponse, response);
  } catch (error) {
    console.error("substack_intelligence.mcp_request_error", error?.message ?? String(error));
    if (!response.headersSent) {
      jsonResponse(response, 500, {error: "mcp_request_failed"});
    }
  } finally {
    try {
      await transport.close();
    } catch {}
    try {
      await server.close();
    } catch {}
  }
}
