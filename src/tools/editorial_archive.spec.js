import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {z} from "zod";
import {editorialArchiveHandler, editorialArchiveSchema} from "./editorial_archive.js";

function publication() {
  return {id: 2225445, name: "Repensar lo Invisible", subdomain: "repensarloinvisible", custom_domain: null};
}

function page({items, next_cursor = null, user_id = 194436705}) {
  return {
    user_id,
    type: "all",
    returned: items.length,
    next_cursor,
    items,
  };
}

function post(id, publication_id = 2225445, title = `Post ${id}`) {
  return {
    type: "post",
    id,
    title,
    subtitle: null,
    author: "Miguel Castro",
    publication: publication_id === 2225445 ? "Repensar lo Invisible" : "Other",
    publication_id,
    published_at: "2026-05-01T00:00:00.000Z",
    url: `https://example.substack.com/p/${id}`,
    audience: "everyone",
    reactions: 0,
    comments: 0,
    restacks: 0,
    preview_text: `Preview ${id}`,
  };
}

function note(id, body = `Note ${id}`) {
  return {
    type: "note",
    id,
    author: "Miguel Castro",
    author_handle: "repensarloinvisible",
    author_user_id: 194436705,
    body,
    date: "2026-08-01T00:00:00.000Z",
    reactions: 0,
    restacks: 0,
    reply_count: 0,
    publication: null,
  };
}

function fullPost(id) {
  return {
    id,
    title: `Post ${id}`,
    subtitle: null,
    author: "Miguel Castro",
    publication: "Repensar lo Invisible",
    publication_id: 2225445,
    published_at: "2026-05-01T00:00:00.000Z",
    url: `https://repensarloinvisible.substack.com/p/${id}`,
    audience: "everyone",
    wordcount: 900,
    reactions: 2,
    comments: 1,
    restacks: 0,
    body_html: `<p>Full body ${id}</p>`,
    preview_text: `Preview ${id}`,
    body_truncated: false,
  };
}

describe("editorialArchiveSchema", () => {
  test("defaults to a complete editorial corpus posture", () => {
    assert.deepEqual(editorialArchiveSchema.parse({}), {
      include_notes: true,
      include_post_bodies: true,
      page_size: 50,
      max_pages: 4,
    });
  });

  test("rejects unknown keys and publishes descriptions", () => {
    assert.throws(() => editorialArchiveSchema.parse({all: true}), z.ZodError);

    const json = z.toJSONSchema(editorialArchiveSchema, {target: "draft-7", io: "input"});
    assert.equal(json.additionalProperties, false);
    for (const [name, property] of Object.entries(json.properties)) {
      assert.ok(property.description, `${name} has no description`);
    }
  });
});

describe("editorialArchiveHandler", () => {
  test("follows profile cursors, keeps Notes and hydrates only posts from the configured publication", async () => {
    const cursors = [];
    const hydrated = [];
    const pages = [
      page({
        items: [note(1), post(10), post(99, 999999, "Other publication post")],
        next_cursor: "page-2",
      }),
      page({items: [post(11), note(1)], next_cursor: null}),
    ];

    const result = await editorialArchiveHandler({}, {
      getPublication: async () => publication(),
      getProfileFeed: async (args) => {
        cursors.push(args.cursor ?? null);
        return pages[cursors.length - 1];
      },
      getReaderPost: async ({post_id}) => {
        hydrated.push(post_id);
        return fullPost(post_id);
      },
    });

    assert.deepEqual(cursors, [null, "page-2"]);
    assert.deepEqual(hydrated.sort((a, b) => a - b), [10, 11]);
    assert.equal(result.complete, true);
    assert.equal(result.next_cursor, null);
    assert.equal(result.posts, 2);
    assert.equal(result.notes, 1);
    assert.equal(result.other_publication_posts_skipped, 1);
    assert.equal(result.returned, 3);
    assert.equal(result.items[0].type, "note");
    assert.equal(result.items[1].body_html, "<p>Full body 10</p>");
    assert.equal(result.items[2].body_html, "<p>Full body 11</p>");
  });

  test("can build a lightweight manifest without Notes or post bodies", async () => {
    let bodyCalls = 0;
    const result = await editorialArchiveHandler(
      {include_notes: false, include_post_bodies: false},
      {
        getPublication: async () => publication(),
        getProfileFeed: async () => page({items: [note(1), post(10)]}),
        getReaderPost: async () => {
          bodyCalls += 1;
          return fullPost(10);
        },
      }
    );

    assert.equal(bodyCalls, 0);
    assert.equal(result.notes, 0);
    assert.equal(result.posts, 1);
    assert.equal(result.bodies_loaded, 0);
    assert.ok(!("body_html" in result.items[0]));
  });

  test("keeps archive metadata and reports a body fetch failure instead of losing the whole corpus", async () => {
    const result = await editorialArchiveHandler({}, {
      getPublication: async () => publication(),
      getProfileFeed: async () => page({items: [post(10), post(11)]}),
      getReaderPost: async ({post_id}) => {
        if (post_id === 11) throw new Error("SubstackAPIException: 503 Service Unavailable");
        return fullPost(post_id);
      },
    });

    assert.equal(result.returned, 2);
    assert.equal(result.bodies_loaded, 1);
    assert.equal(result.post_errors.length, 1);
    assert.equal(result.post_errors[0].post_id, 11);
    assert.match(result.items[1].body_load_error, /503/);
    assert.equal(result.items[1].title, "Post 11");
  });

  test("stops at max_pages and returns a continuation cursor for the MCP client", async () => {
    let calls = 0;
    const result = await editorialArchiveHandler(
      {max_pages: 2, include_post_bodies: false},
      {
        getPublication: async () => publication(),
        getProfileFeed: async (args) => {
          calls += 1;
          return page({items: [post(calls)], next_cursor: `cursor-${calls + 1}`});
        },
        getReaderPost: async () => {
          throw new Error("should not be called");
        },
      }
    );

    assert.equal(calls, 2);
    assert.equal(result.complete, false);
    assert.equal(result.next_cursor, "cursor-3");
    assert.equal(result.returned, 2);
  });

  test("stops a stalled cursor rather than looping forever", async () => {
    const result = await editorialArchiveHandler(
      {cursor: "same", include_post_bodies: false},
      {
        getPublication: async () => publication(),
        getProfileFeed: async () => page({items: [post(10)], next_cursor: "same"}),
        getReaderPost: async () => {
          throw new Error("should not be called");
        },
      }
    );

    assert.equal(result.complete, false);
    assert.equal(result.next_cursor, "same");
    assert.match(result.warning, /stopped advancing/);
  });
});
