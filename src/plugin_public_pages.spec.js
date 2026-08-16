import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import siteHandler from "../api/site.js";

function fakeResponse() {
  return {
    statusCode: null,
    headers: {},
    body: "",
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = "") { this.body = String(value); },
  };
}

async function render(page) {
  const response = fakeResponse();
  await siteHandler({method: "GET", url: `/api/site?page=${page}`}, response);
  return response;
}

describe("public plugin pages", () => {
  test("home explains the public read-only product", async () => {
    const response = await render("home");
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /See the archive as a body of thought/);
    assert.match(response.body, /does not publish, edit posts/);
  });

  test("privacy explains public retrieval and storage posture", async () => {
    const response = await render("privacy");
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /does not intentionally persist retrieved article bodies or tool results/);
    assert.match(response.body, /private development endpoint is not part of the public plugin listing/);
  });

  test("terms state the read-only boundary", async () => {
    const response = await render("terms");
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /does not publish, modify, delete, comment on/);
  });

  test("support page is published", async () => {
    const response = await render("support");
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Report a problem/);
  });

  test("unknown page is 404 and non-GET is 405", async () => {
    const missing = await render("unknown");
    assert.equal(missing.statusCode, 404);
    const response = fakeResponse();
    await siteHandler({method: "POST", url: "/api/site?page=home"}, response);
    assert.equal(response.statusCode, 405);
  });
});

describe("Vercel public routes", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const routes = Object.fromEntries(config.rewrites.map(({source, destination}) => [source, destination]));

  test("keeps the verification challenge route", () => {
    assert.equal(routes["/.well-known/openai-apps-challenge"], "/api/openai-apps-challenge");
  });

  test("publishes listing, privacy, terms and support URLs", () => {
    assert.equal(routes["/"], "/api/site?page=home");
    assert.equal(routes["/privacy"], "/api/site?page=privacy");
    assert.equal(routes["/terms"], "/api/site?page=terms");
    assert.equal(routes["/support"], "/api/site?page=support");
  });
});
