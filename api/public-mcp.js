import {WebStandardStreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {createPublicIntelligenceServer} from "../src/public_intelligence_server.js";

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
  const method = request.method ?? "POST";
  const headers = copyHeaders(request.headers);
  const protocol = headers.get("x-forwarded-proto") ?? "https";
  const host = headers.get("host") ?? "localhost";
  const url = new URL(request.url ?? "/api/public-mcp", `${protocol}://${host}`);
  return new Request(url, {method, headers});
}

async function writeWebResponse(webResponse, response) {
  response.status(webResponse.status);
  for (const [name, value] of webResponse.headers.entries()) response.setHeader(name, value);
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
  if (request.method === "GET" || request.method === "DELETE") {
    jsonResponse(response, 405, {error: "method_not_allowed"}, {Allow: "POST"});
    return;
  }

  if (request.method !== "POST") {
    jsonResponse(response, 405, {error: "method_not_allowed"}, {Allow: "POST"});
    return;
  }

  const server = createPublicIntelligenceServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  transport.onerror = (error) => {
    console.error("substack_intelligence.public_mcp_transport_error", error?.message ?? String(error));
  };

  try {
    await server.connect(transport);
    const webRequest = toWebRequest(request);
    const webResponse = await transport.handleRequest(webRequest, {parsedBody: request.body});
    await writeWebResponse(webResponse, response);
  } catch (error) {
    console.error("substack_intelligence.public_mcp_request_error", error?.message ?? String(error));
    if (!response.headersSent) jsonResponse(response, 500, {error: "mcp_request_failed"});
  } finally {
    try {
      await transport.close();
    } catch {}
    try {
      await server.close();
    } catch {}
  }
}
