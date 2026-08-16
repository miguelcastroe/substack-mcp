import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {z} from "zod";
import {
  publicEditorialArchiveSchema,
  publicEditorialArchiveHandler,
  fetchPublicArchivePage,
} from "./public_editorial_archive.js";

describe("publicEditorialArchiveSchema", () => {
  test("defaults to a public editorial corpus posture", () => {
    assert.deepEqual(publicEditorialArchiveSchema.parse({publication_url: "https://example.substack.com"}), {
      publication_url: "https://example.substack.com",
      include_bodies: true,
      include_non_newsletter: false,
      max_posts: 30,
      offset: 0,
    });
  });

  test("rejects unknown keys and publishes descriptions", () => {
    assert.throws(
      () => publicEditorialArchiveSchema.parse({publication_url: "https://example.substack.com", nope: true}),
      z.ZodError
    );
    const json = z.toJSONSchema(publicEditorialArchiveSchema, {target: "draft-7", io: "input"});
    assert.equal(json.additionalProperties, false);
    for (const property of Object.values(json.properties)) assert.ok(property.description);
  });
});

describe("publicEditorialArchiveHandler", () => {
  test("paginates, keeps newsletter posts and hydrates their public bodies", async () => {
    const archiveCalls = [];
    const bodyCalls = [];
    const pages = new Map([
      [0, [
        {id: 1, slug: "one", title: "One", type: "newsletter", audience: "everyone", post_date: "2026-01-04"},
        {id: 2, slug: "pod", title: "Podcast", type: "podcast", audience: "everyone", post_date: "2026-01-03"},
        {id: 4, slug: "four", title: "Four", type: "newsletter", audience: "everyone", post_date: "2026-01-02"},
      ]],
      [3, [
        {id: 3, slug: "three", title: "Three", type: "newsletter", audience: "only_paid", post_date: "2026-01-01"},
      ]],
    ]);

    const result = await publicEditorialArchiveHandler(
      {publication_url: "https://example.substack.com", max_posts: 3},
      {
        fetchArchivePage: async ({offset, limit}) => {
          archiveCalls.push({offset, limit});
          return {items: pages.get(offset) ?? [], origin: "https://example.substack.com"};
        },
        fetchPost: async ({origin, slug}) => {
          bodyCalls.push({origin, slug});
          return {
            slug,
            title: slug[0].toUpperCase() + slug.slice(1),
            audience: slug === "three" ? "only_paid" : "everyone",
            body_html: `<p>${slug} body</p>`,
          };
        },
      }
    );

    assert.equal(result.returned, 3);
    // The final page was exactly as large as the remaining request budget. The server cannot know
    // whether another archive entry exists without a continuation call, so it must preserve the
    // next offset instead of falsely declaring the archive complete.
    assert.equal(result.complete, false);
    assert.equal(result.next_offset, 4);
    assert.equal(result.non_newsletter_entries_skipped, 1);
    assert.deepEqual(result.items.map((item) => item.slug), ["one", "four", "three"]);
    assert.equal(result.items[0].body_html, "<p>one body</p>");
    assert.equal(result.items[0].body_scope, "public_body");
    assert.equal(result.items[2].body_scope, "public_preview");
    assert.deepEqual(bodyCalls.map((call) => call.slug), ["one", "four", "three"]);
    assert.deepEqual(archiveCalls.map((call) => call.offset), [0, 3]);
  });

  test("can return a metadata-only manifest", async () => {
    let bodyCalls = 0;
    const result = await publicEditorialArchiveHandler(
      {publication_url: "https://example.substack.com", include_bodies: false},
      {
        fetchArchivePage: async () => ({
          items: [{id: 1, slug: "one", title: "One", type: "newsletter"}],
          origin: "https://example.substack.com",
        }),
        fetchPost: async () => {
          bodyCalls += 1;
          return {};
        },
      }
    );

    assert.equal(bodyCalls, 0);
    assert.equal(result.items[0].title, "One");
    assert.ok(!("body_html" in result.items[0]));
  });

  test("keeps metadata when one body fetch fails", async () => {
    const result = await publicEditorialArchiveHandler(
      {publication_url: "https://example.substack.com", max_posts: 2},
      {
        fetchArchivePage: async () => ({
          items: [
            {id: 1, slug: "one", title: "One", type: "newsletter"},
            {id: 2, slug: "two", title: "Two", type: "newsletter"},
          ],
          origin: "https://example.substack.com",
        }),
        fetchPost: async ({slug}) => {
          if (slug === "two") throw new Error("body unavailable");
          return {slug, body_html: "<p>ok</p>"};
        },
      }
    );

    assert.equal(result.returned, 2);
    assert.equal(result.bodies_loaded, 1);
    assert.equal(result.post_errors.length, 1);
    assert.equal(result.items[1].title, "Two");
    assert.match(result.items[1].body_load_error, /unavailable/);
  });

  test("returns next_offset when the caller caps the scan before exhaustion", async () => {
    const result = await publicEditorialArchiveHandler(
      {publication_url: "https://example.substack.com", include_bodies: false, max_posts: 1},
      {
        fetchArchivePage: async ({offset, limit}) => ({
          items: Array.from({length: limit}, (_, index) => ({
            id: offset + index + 1,
            slug: `post-${offset + index + 1}`,
            type: "newsletter",
          })),
          origin: "https://example.substack.com",
        }),
        fetchPost: async () => ({}),
      }
    );

    assert.equal(result.complete, false);
    assert.equal(result.next_offset, 1);
    assert.equal(result.returned, 1);
  });
});

describe("fetchPublicArchivePage security", () => {
  test("refuses a private destination before issuing a fetch", async () => {
    let fetched = false;
    await assert.rejects(
      () => fetchPublicArchivePage(
        {publication_url: "http://internal.example", offset: 0, limit: 1},
        {
          lookup: async () => [{address: "127.0.0.1", family: 4}],
          fetchImpl: async () => {
            fetched = true;
            return new Response("[]", {status: 200});
          },
        }
      ),
      /private\/loopback/
    );
    assert.equal(fetched, false);
  });

  test("accepts a public archive response and reports the final origin", async () => {
    const result = await fetchPublicArchivePage(
      {publication_url: "https://custom.example/p/a-post", offset: 0, limit: 1},
      {
        lookup: async () => [{address: "203.0.113.10", family: 4}],
        fetchImpl: async () => new Response(
          JSON.stringify([{id: 1, slug: "one"}]),
          {status: 200, headers: {"Content-Type": "application/json"}}
        ),
      }
    );

    assert.equal(result.items.length, 1);
    assert.equal(result.origin, "https://custom.example");
  });
});
