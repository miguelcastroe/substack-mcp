import {describe, test} from "node:test";
import assert from "node:assert/strict";
import handler from "../api/mcp.js";

function fakeResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      this.headersSent = true;
      return this;
    },
    on() {},
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

describe("remote MCP endpoint", () => {
  test("refuses to operate when required secrets are not configured", async () => {
    const before = snapshotEnv();
    try {
      for (const name of ENV_NAMES) delete process.env[name];
      const response = fakeResponse();
      await handler({method: "POST", headers: {}, body: {}}, response);
      assert.equal(response.statusCode, 503);
      assert.equal(response.body.error, "server_not_configured");
      assert.deepEqual(response.body.missing.sort(), [...ENV_NAMES].sort());
    } finally {
      restoreEnv(before);
    }
  });

  test("requires the configured bearer token before touching Substack", async () => {
    const before = snapshotEnv();
    try {
      process.env.SUBSTACK_PUBLICATION_URL = "https://example.substack.com";
      process.env.SUBSTACK_SESSION_TOKEN = "session-secret";
      process.env.SUBSTACK_USER_ID = "123";
      process.env.SUBSTACK_MCP_BEARER_TOKEN = "transport-secret";

      const response = fakeResponse();
      await handler(
        {method: "POST", headers: {authorization: "Bearer wrong"}, body: {}},
        response
      );

      assert.equal(response.statusCode, 401);
      assert.equal(response.body.error, "unauthorized");
      assert.equal(response.headers["www-authenticate"], "Bearer");
    } finally {
      restoreEnv(before);
    }
  });
});
