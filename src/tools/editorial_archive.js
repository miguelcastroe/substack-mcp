import {z} from "zod";
import {getPublicationHandler} from "./get_publication.js";
import {getProfileFeedHandler} from "./get_profile_feed.js";
import {getReaderPostHandler} from "./get_reader_post.js";
import {logger} from "../logger.js";

const BODY_CONCURRENCY = 6;

export const editorialArchiveSchema = z.strictObject({
  user_id: z
    .number()
    .int()
    .optional()
    .describe(
      "Whose profile to scan. Defaults to SUBSTACK_USER_ID — your own. Published posts are still " +
      "limited to the configured SUBSTACK_PUBLICATION_URL; Notes belong to the scanned profile."
    ),
  include_notes: z
    .boolean()
    .default(true)
    .describe(
      "Include the profile's Notes alongside published posts. Defaults to true so the archive can " +
      "show how long-form posts and Notes connect editorially."
    ),
  include_post_bodies: z
    .boolean()
    .default(true)
    .describe(
      "Fetch the complete readable HTML body for every matching published post. Defaults to true. " +
      "Set false when only an archive manifest is needed."
    ),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(50)
    .describe("Profile entries to request per Substack page. 1–50, defaults to 50."),
  max_pages: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(4)
    .describe(
      "Maximum profile pages to scan in one call. Defaults to 4 (up to 200 profile entries). If " +
      "more remain, next_cursor is returned so an MCP client can continue automatically."
    ),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Continue a previous archive scan from its next_cursor. Usually omitted; an MCP client can " +
      "follow continuation cursors without asking the user to copy them."
    ),
});

const defaultDeps = {
  getPublication: (args) => getPublicationHandler(args),
  getProfileFeed: (args) => getProfileFeedHandler(args),
  getReaderPost: (args) => getReaderPostHandler(args),
};

async function mapWithConcurrency(items, concurrency, mapper) {
  if (items.length === 0) return [];

  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    {length: Math.min(concurrency, items.length)},
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Build an editorial corpus from the configured publication plus the profile's Notes.
 *
 * The profile feed is the authoritative chronology for the user's own published posts + Notes, but
 * its post entries intentionally contain only teasers. This composite follows profile cursors,
 * filters posts to the configured publication, then hydrates those post ids through get_reader_post.
 * The result is what an editorial model needs to compare language, themes and connections without
 * making the user manually copy ids or run one command per article.
 */
export const editorialArchiveHandler = async (args, deps = defaultDeps) => {
  logger.debug("editorial_archive.start", {args});

  let validatedArgs;
  try {
    validatedArgs = editorialArchiveSchema.parse(args);
  } catch (error) {
    logger.error("editorial_archive.args.invalid", {issues: error.issues ?? error.message});
    throw error;
  }

  const {
    user_id,
    include_notes,
    include_post_bodies,
    page_size,
    max_pages,
  } = validatedArgs;

  const publication = await deps.getPublication({full: false});
  if (!publication?.id) {
    throw new Error("The configured publication could not be resolved to a numeric publication id.");
  }

  const publicationId = String(publication.id);
  const collected = new Map();
  let nextCursor = validatedArgs.cursor ?? null;
  let resolvedUserId = user_id ?? null;
  let pagesScanned = 0;
  let profileEntriesScanned = 0;
  let nonContentItemsSkipped = 0;
  let otherPublicationPostsSkipped = 0;
  let invalidItemsSkipped = 0;
  let cursorStalled = false;

  while (pagesScanned < max_pages) {
    const requestCursor = nextCursor;
    const page = await deps.getProfileFeed({
      ...(user_id !== undefined ? {user_id} : {}),
      type: "all",
      limit: page_size,
      ...(requestCursor ? {cursor: requestCursor} : {}),
    });

    pagesScanned += 1;
    resolvedUserId = page?.user_id ?? resolvedUserId;
    const pageItems = page?.items ?? [];
    profileEntriesScanned += page?.returned ?? pageItems.length;
    nonContentItemsSkipped += page?.non_content_items_skipped ?? 0;

    for (const item of pageItems) {
      if (!item?.id || !item?.type) {
        invalidItemsSkipped += 1;
        continue;
      }

      if (item.type === "post") {
        if (String(item.publication_id ?? "") !== publicationId) {
          otherPublicationPostsSkipped += 1;
          continue;
        }
        collected.set(`post:${item.id}`, item);
        continue;
      }

      if (item.type === "note" && include_notes) {
        collected.set(`note:${item.id}`, item);
      }
    }

    const candidateCursor = page?.next_cursor ?? null;
    if (!candidateCursor) {
      nextCursor = null;
      break;
    }

    if (candidateCursor === requestCursor) {
      cursorStalled = true;
      nextCursor = candidateCursor;
      break;
    }

    nextCursor = candidateCursor;
  }

  const archiveItems = [...collected.values()];
  const posts = archiveItems.filter((item) => item.type === "post");
  const notes = archiveItems.filter((item) => item.type === "note");
  const hydratedById = new Map();
  const postErrors = [];

  if (include_post_bodies) {
    const hydrated = await mapWithConcurrency(posts, BODY_CONCURRENCY, async (post) => {
      try {
        const full = await deps.getReaderPost({post_id: post.id, include_body: true});
        return {post, full, error: null};
      } catch (error) {
        return {
          post,
          full: null,
          error: error?.message ?? String(error),
        };
      }
    });

    for (const entry of hydrated) {
      if (entry.error) {
        postErrors.push({post_id: entry.post.id, title: entry.post.title ?? null, error: entry.error});
        hydratedById.set(entry.post.id, {
          ...entry.post,
          body_load_error: entry.error,
        });
      } else {
        hydratedById.set(entry.post.id, {
          ...entry.post,
          ...entry.full,
          type: "post",
        });
      }
    }
  }

  const items = archiveItems.map((item) => {
    if (item.type !== "post" || !include_post_bodies) return item;
    return hydratedById.get(item.id) ?? item;
  });

  const complete = nextCursor === null && !cursorStalled;

  logger.info("editorial_archive.done", {
    publication_id: publication.id,
    user_id: resolvedUserId,
    pages_scanned: pagesScanned,
    profile_entries_scanned: profileEntriesScanned,
    returned: items.length,
    posts: posts.length,
    notes: notes.length,
    bodies_loaded: include_post_bodies ? posts.length - postErrors.length : 0,
    body_errors: postErrors.length,
    complete,
  });

  return {
    scope: "configured_publication_posts_plus_profile_notes",
    publication: {
      id: publication.id,
      name: publication.name ?? null,
      subdomain: publication.subdomain ?? null,
      custom_domain: publication.custom_domain ?? null,
    },
    user_id: resolvedUserId,
    pages_scanned: pagesScanned,
    profile_entries_scanned: profileEntriesScanned,
    returned: items.length,
    posts: posts.length,
    notes: notes.length,
    bodies_loaded: include_post_bodies ? posts.length - postErrors.length : 0,
    complete,
    next_cursor: complete ? null : nextCursor,
    ...(otherPublicationPostsSkipped
      ? {other_publication_posts_skipped: otherPublicationPostsSkipped}
      : {}),
    ...(nonContentItemsSkipped ? {non_content_items_skipped: nonContentItemsSkipped} : {}),
    ...(invalidItemsSkipped ? {invalid_items_skipped: invalidItemsSkipped} : {}),
    ...(cursorStalled
      ? {warning: "Profile pagination cursor stopped advancing; the scan was stopped to avoid a loop."}
      : {}),
    ...(postErrors.length ? {post_errors: postErrors} : {}),
    items,
  };
};
