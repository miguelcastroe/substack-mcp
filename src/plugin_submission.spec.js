import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import challengeHandler from "../api/openai-apps-challenge.js";

function fakeResponse() {
  return {
    statusCode: null,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(value = "") {
      this.body = String(value);
      return this;
    },
  };
}

describe("OpenAI plugin domain verification", () => {
  test("the root well-known path is routed to the serverless challenge handler", () => {
    const config = JSON.parse(
      readFileSync(new URL("../vercel.json", import.meta.url), "utf8")
    );

    assert.ok(
      config.rewrites.some(
        (rewrite) =>
          rewrite.source === "/.well-known/openai-apps-challenge" &&
          rewrite.destination === "/api/openai-apps-challenge"
      )
    );
  });

  test("returns 404 until the submission portal has issued a token", async () => {
    const saved = process.env.OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN;
    delete process.env.OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN;

    try {
      const response = fakeResponse();
      await challengeHandler({method: "GET"}, response);

      assert.equal(response.statusCode, 404);
      assert.equal(response.body, "Not Found");
    } finally {
      if (saved === undefined) delete process.env.OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN;
      else process.env.OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN = saved;
    }
  });

  test("returns exactly the configured token as plain text", async () => {
    const saved = process.env.OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN;
    process.env.OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN = "openai-verification-token";

    try {
      const response = fakeResponse();
      await challengeHandler({method: "GET"}, response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.headers["content-type"], "text/plain; charset=utf-8");
      assert.equal(response.body, "openai-verification-token");
      assert.ok(!response.body.endsWith("\n"));
    } finally {
      if (saved === undefined) delete process.env.OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN;
      else process.env.OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN = saved;
    }
  });

  test("rejects methods other than GET", async () => {
    const response = fakeResponse();
    await challengeHandler({method: "POST"}, response);

    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "GET");
  });
});
