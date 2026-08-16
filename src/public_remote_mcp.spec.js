import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {LATEST_PROTOCOL_VERSION} from "@modelcontextprotocol/sdk/types.js";
import handler from "../api/public-mcp.js";

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

function mcpRequest(body, extraHeaders = {}) {
  return {
    method: "POST",
    url: "/api/public-mcp",
    headers: {
      host: "example.vercel.app",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body,
  };
}

function mcpGet(extraHeaders = {}) {
  return {
    method: "GET",
    url: "/api/public-mcp",
    headers: {
      host: "example.vercel.app",
      accept: "text/event-stream",
      ...extraHeaders,
    },
  };
}

describe("public remote MCP endpoint", () => {
  test("completes initialize without private Substack credentials or bearer auth", async () => {
    const response = fakeResponse();
    await handler(
      mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {name: "public-mcp-test", version: "1.0.0"},
        },
      }),
      response
    );

    assert.equal(response.statusCode, 200);
    const body = response.jsonValue();
    assert.equal(body.result.serverInfo.name, "Substack Intelligence Public");
  });

  test("returns 405 to standalone GET/SSE", async () => {
    const response = fakeResponse();
    await handler(mcpGet({"mcp-protocol-version": LATEST_PROTOCOL_VERSION}), response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "POST");
  });

  test("lists only the public archive tool with read-only annotations", async () => {
    const response = fakeResponse();
    await handler(
      mcpRequest(
        {jsonrpc: "2.0", id: 2, method: "tools/list", params: {}},
        {"mcp-protocol-version": LATEST_PROTOCOL_VERSION}
      ),
      response
    );

    assert.equal(response.statusCode, 200);
    const tools = response.jsonValue().result.tools;
    assert.deepEqual(tools.map((tool) => tool.name), ["public_editorial_archive"]);
    assert.equal(tools[0].annotations.readOnlyHint, true);
    assert.equal(tools[0].annotations.destructiveHint, false);
    assert.equal(tools[0].annotations.openWorldHint, true);
  });
});
