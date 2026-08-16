import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {LATEST_PROTOCOL_VERSION} from "@modelcontextprotocol/sdk/types.js";
import handler from "../api/mcp.js";

function fakeResponse() {
  return {
    statusCode: null,
    headers: {},
    body: Buffer.alloc(0),
    headersSent: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(value = Buffer.alloc(0)) {
      this.body = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
      this.headersSent = true;
      return this;
    },
    jsonValue() {
      return JSON.parse(this.body.toString("utf8"));
    },
  };
}

function mcpRequest(body, authorization = "Bearer transport-secret", extraHeaders = {}) {
  return {
    method: "POST",
    url: "/api/mcp",
    headers: {
      host: "example.vercel.app",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization,
      ...extraHeaders,
    },
    body,
  };
}

function mcpGet(authorization = "Bearer transport-secret", extraHeaders = {}) {
  return {
    method: "GET",
    url: "/api/mcp",
    headers: {
      host: "example.vercel.app",
      accept: "text/event-stream",
      authorization,
      ...extraHeaders,
    },
  };
}

const ENV_NAMES = [
  "SUBSTACK_PUBLICATION_URL",
  "SUBSTACK_SESSION_TOKEN",
  "SUBSTACK_USER_ID",
  "SUBSTACK_MCP_BEARER_TOKEN",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot) {
  for (const name of ENV_NAMES) {
    if (snapshot[name] === undefined) delete process.env[name];
    else process.env[name] = snapshot[name];
  }
}

function configureTestEnv() {
  process.env.SUBSTACK_PUBLICATION_URL = "https://example.substack.com";
  process.env.SUBSTACK_SESSION_TOKEN = "session-secret";
  process.env.SUBSTACK_USER_ID = "123";
  process.env.SUBSTACK_MCP_BEARER_TOKEN = "transport-secret";
}

describe("remote MCP endpoint", () => {
  test("refuses to operate when required secrets are not configured", async () => {
    const before = snapshotEnv();
    try {
      for (const name of ENV_NAMES) delete process.env[name];
      const response = fakeResponse();
      await handler(mcpRequest({}), response);
      assert.equal(response.statusCode, 503);
      const body = response.jsonValue();
      assert.equal(body.error, "server_not_configured");
      assert.deepEqual(body.missing.sort(), [...ENV_NAMES].sort());
    } finally {
      restoreEnv(before);
    }
  });

  test("requires the configured bearer token before touching Substack", async () => {
    const before = snapshotEnv();
    try {
      configureTestEnv();
      const response = fakeResponse();
      await handler(mcpRequest({}, "Bearer wrong"), response);

      assert.equal(response.statusCode, 401);
      assert.equal(response.jsonValue().error, "unauthorized");
      assert.equal(response.headers["www-authenticate"], "Bearer");
    } finally {
      restoreEnv(before);
    }
  });

  test("completes an initialize handshake through the Vercel adapter", async () => {
    const before = snapshotEnv();
    try {
      configureTestEnv();
      const response = fakeResponse();
      await handler(
        mcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: {name: "remote-mcp-test", version: "1.0.0"},
          },
        }),
        response
      );

      assert.equal(response.statusCode, 200);
      const body = response.jsonValue();
      assert.equal(body.jsonrpc, "2.0");
      assert.equal(body.id, 1);
      assert.equal(body.result.serverInfo.name, "Substack Intelligence");
    } finally {
      restoreEnv(before);
    }
  });

  test("accepts initialized notification without opening a response stream", async () => {
    const before = snapshotEnv();
    try {
      configureTestEnv();
      const response = fakeResponse();
      await handler(
        mcpRequest(
          {jsonrpc: "2.0", method: "notifications/initialized"},
          "Bearer transport-secret",
          {"mcp-protocol-version": LATEST_PROTOCOL_VERSION}
        ),
        response
      );

      assert.equal(response.statusCode, 202);
    } finally {
      restoreEnv(before);
    }
  });

  test("returns 405 to the standalone GET/SSE probe used by Streamable HTTP clients", async () => {
    const before = snapshotEnv();
    try {
      configureTestEnv();
      const response = fakeResponse();
      await handler(
        mcpGet("Bearer transport-secret", {"mcp-protocol-version": LATEST_PROTOCOL_VERSION}),
        response
      );

      assert.equal(response.statusCode, 405);
      assert.equal(response.headers.allow, "POST");
      assert.equal(response.jsonValue().error, "method_not_allowed");
    } finally {
      restoreEnv(before);
    }
  });

  test("lists tools on a fresh stateless request with explicit read-only review hints", async () => {
    const before = snapshotEnv();
    try {
      configureTestEnv();
      const response = fakeResponse();
      await handler(
        mcpRequest(
          {jsonrpc: "2.0", id: 2, method: "tools/list", params: {}},
          "Bearer transport-secret",
          {"mcp-protocol-version": LATEST_PROTOCOL_VERSION}
        ),
        response
      );

      assert.equal(response.statusCode, 200);
      const body = response.jsonValue();
      assert.equal(body.jsonrpc, "2.0");
      assert.equal(body.id, 2);
      assert.ok(body.result.tools.some((tool) => tool.name === "substack_landscape"));
      assert.ok(body.result.tools.some((tool) => tool.name === "editorial_archive"));
      assert.ok(body.result.tools.some((tool) => tool.name === "archive_intelligence"));

      for (const tool of body.result.tools) {
        assert.deepEqual(
          tool.annotations,
          {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
          },
          `${tool.name} must expose explicit read-only submission hints`
        );
      }
    } finally {
      restoreEnv(before);
    }
  });
});
