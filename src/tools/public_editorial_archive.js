import dns from "node:dns";
import {z} from "zod";
import {isPrivateAddress} from "../api/substack/image.js";
import {logger} from "../logger.js";

const ARCHIVE_PAGE_SIZE = 12;
const MAX_SCAN_PAGES = 20;
const BODY_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 20000;
const MAX_JSON_BYTES = 5 * 1024 * 1024;

const defaultLookup = (hostname) => dns.promises.lookup(hostname, {all: true});

export const publicEditorialArchiveSchema = z.strictObject({
  publication_url: z
    .string()
    .url()
    .describe(
      "Public URL of a Substack publication, for example https://example.substack.com or a custom domain hosted by Substack. A post URL is also accepted; only its origin is used."
    ),
  include_bodies: z
    .boolean()
    .default(true)
    .describe(
      "Fetch the public body returned by Substack for every matching post. Defaults to true. Paid posts may expose only their public preview when called without a subscriber session."
    ),
  include_non_newsletter: z
    .boolean()
    .default(false)
    .describe(
      "Include podcast/thread/other archive entries as well as newsletter posts. Defaults to false so editorial analysis focuses on written newsletter posts."
    ),
  max_posts: z
    .number()
    .int()
    .min(1)
    .max(60)
    .default(30)
    .describe(
      "Maximum matching posts to return in this call, from 1 to 60. Defaults to 30. If more remain, next_offset lets the MCP client continue automatically."
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      "Archive offset to continue from. Usually omit it; when complete is false, an MCP client can call again with next_offset without asking the user to copy anything."
    ),
});

function originFromPublicationUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`public_substack: only http and https URLs are allowed, got ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("public_substack: URLs containing credentials are not allowed");
  }
  return parsed.origin;
}

async function assertPublicHttpUrl(rawUrl, lookup) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`public_substack: only http and https URLs are allowed, got ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("public_substack: URLs containing credentials are not allowed");
  }

  const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  const addresses = await lookup(hostname);
  for (const {address, family} of addresses) {
    if (isPrivateAddress(address, family)) {
      throw new Error(`public_substack: refusing to fetch a private/loopback address (${address})`);
    }
  }
  return parsed;
}

async function readJsonCapped(response) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_JSON_BYTES) {
    throw new Error(`public_substack: response is ${declared} bytes, over the ${MAX_JSON_BYTES}-byte limit`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_JSON_BYTES) {
    throw new Error(`public_substack: response is ${buffer.byteLength} bytes, over the ${MAX_JSON_BYTES}-byte limit`);
  }

  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new Error("public_substack: expected JSON from the Substack endpoint");
  }
}

async function fetchJsonGuarded(rawUrl, {lookup = defaultLookup, fetchImpl = fetch, maxRedirects = 3} = {}) {
  let target = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicHttpUrl(target, lookup);
    const response = await fetchImpl(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {Accept: "application/json"},
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`public_substack: redirect with no Location header from ${target}`);
      target = new URL(location, target).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`public_substack: endpoint responded ${response.status} ${response.statusText}`);
    }

    return {
      payload: await readJsonCapped(response),
      final_url: response.url || target,
    };
  }

  throw new Error(`public_substack: too many redirects (> ${maxRedirects})`);
}

export async function fetchPublicArchivePage(
  {publication_url, offset, limit},
  {lookup = defaultLookup, fetchImpl = fetch} = {}
) {
  const origin = originFromPublicationUrl(publication_url);
  const url = new URL("/api/v1/archive", origin);
  url.searchParams.set("sort", "new");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));

  const result = await fetchJsonGuarded(url.toString(), {lookup, fetchImpl});
  if (!Array.isArray(result.payload)) {
    throw new Error("public_substack: archive endpoint did not return an array");
  }

  return {
    items: result.payload,
    origin: new URL(result.final_url).origin,
  };
}

export async function fetchPublicPost(
  {origin, slug},
  {lookup = defaultLookup, fetchImpl = fetch} = {}
) {
  const url = new URL(`/api/v1/posts/${encodeURIComponent(slug)}`, origin);
  const result = await fetchJsonGuarded(url.toString(), {lookup, fetchImpl});
  const post = result.payload?.post ?? result.payload;
  if (!post || typeof post !== "object" || Array.isArray(post)) {
    throw new Error(`public_substack: post endpoint returned no post for slug ${slug}`);
  }
  return post;
}

function summarizeArchivePost(post) {
  return {
    type: "post",
    id: post?.id ?? null,
    title: post?.title ?? null,
    subtitle: post?.subtitle ?? null,
    slug: post?.slug ?? null,
    description: post?.description ?? null,
    url: post?.canonical_url ?? null,
    audience: post?.audience ?? null,
    content_type: post?.type ?? null,
    published_at: post?.post_date ?? null,
    wordcount: post?.wordcount ?? null,
    reactions: post?.reaction_count ?? post?.reactions ?? 0,
    comments: post?.comment_count ?? 0,
    restacks: post?.restacks ?? 0,
    authors: (post?.publishedBylines ?? []).map((byline) => ({
      id: byline?.id ?? null,
      name: byline?.name ?? null,
    })),
    preview_text: post?.truncated_body_text ?? null,
  };
}

function summarizeHydratedPost(meta, full) {
  return {
    ...meta,
    title: full?.title ?? meta.title,
    subtitle: full?.subtitle ?? meta.subtitle,
    description: full?.description ?? meta.description,
    url: full?.canonical_url ?? meta.url,
    audience: full?.audience ?? meta.audience,
    published_at: full?.post_date ?? meta.published_at,
    wordcount: full?.wordcount ?? meta.wordcount,
    body_html: full?.body_html ?? null,
    body_text_preview: full?.truncated_body_text ?? meta.preview_text,
    body_scope: (full?.audience ?? meta.audience) === "only_paid" ? "public_preview" : "public_body",
  };
}

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

  await Promise.all(
    Array.from({length: Math.min(concurrency, items.length)}, () => worker())
  );
  return results;
}

const defaultDeps = {
  fetchArchivePage: (args) => fetchPublicArchivePage(args),
  fetchPost: (args) => fetchPublicPost(args),
};

export const publicEditorialArchiveHandler = async (args, deps = defaultDeps) => {
  let validatedArgs;
  try {
    validatedArgs = publicEditorialArchiveSchema.parse(args);
  } catch (error) {
    logger.error("public_editorial_archive.args.invalid", {issues: error.issues ?? error.message});
    throw error;
  }

  const {
    publication_url,
    include_bodies,
    include_non_newsletter,
    max_posts,
    offset,
  } = validatedArgs;

  logger.info("public_editorial_archive.start", {
    host: new URL(publication_url).hostname,
    include_bodies,
    include_non_newsletter,
    max_posts,
    offset,
  });

  const collected = new Map();
  let currentOffset = offset;
  let resolvedOrigin = null;
  let archiveEntriesScanned = 0;
  let nonNewsletterSkipped = 0;
  let invalidEntriesSkipped = 0;
  let pagesScanned = 0;
  let exhausted = false;

  while (collected.size < max_posts && pagesScanned < MAX_SCAN_PAGES) {
    const remaining = max_posts - collected.size;
    const limit = Math.min(ARCHIVE_PAGE_SIZE, remaining);
    const page = await deps.fetchArchivePage({publication_url, offset: currentOffset, limit});
    pagesScanned += 1;
    resolvedOrigin = page?.origin ?? resolvedOrigin;

    const raw = page?.items ?? [];
    archiveEntriesScanned += raw.length;

    if (raw.length === 0) {
      exhausted = true;
      break;
    }

    for (const post of raw) {
      if (!post?.id || !post?.slug) {
        invalidEntriesSkipped += 1;
        continue;
      }
      if (!include_non_newsletter && post.type && post.type !== "newsletter") {
        nonNewsletterSkipped += 1;
        continue;
      }
      collected.set(String(post.id), summarizeArchivePost(post));
    }

    currentOffset += raw.length;
    if (raw.length < limit) {
      exhausted = true;
      break;
    }
  }

  const posts = [...collected.values()].slice(0, max_posts);
  const hydratedById = new Map();
  const postErrors = [];

  if (include_bodies && posts.length > 0) {
    if (!resolvedOrigin) {
      throw new Error("public_substack: could not resolve the publication origin");
    }

    const hydrated = await mapWithConcurrency(posts, BODY_CONCURRENCY, async (post) => {
      try {
        const full = await deps.fetchPost({origin: resolvedOrigin, slug: post.slug});
        return {post, full, error: null};
      } catch (error) {
        return {post, full: null, error: error?.message ?? String(error)};
      }
    });

    for (const entry of hydrated) {
      if (entry.error) {
        postErrors.push({post_id: entry.post.id, slug: entry.post.slug, error: entry.error});
        hydratedById.set(entry.post.id, {...entry.post, body_load_error: entry.error});
      } else {
        hydratedById.set(entry.post.id, summarizeHydratedPost(entry.post, entry.full));
      }
    }
  }

  const items = posts.map((post) =>
    include_bodies ? hydratedById.get(post.id) ?? post : post
  );
  const complete = exhausted;

  logger.info("public_editorial_archive.done", {
    host: new URL(publication_url).hostname,
    resolved_host: resolvedOrigin ? new URL(resolvedOrigin).hostname : null,
    pages_scanned: pagesScanned,
    archive_entries_scanned: archiveEntriesScanned,
    returned: items.length,
    bodies_loaded: include_bodies ? items.length - postErrors.length : 0,
    body_errors: postErrors.length,
    complete,
  });

  return {
    scope: "public_substack_publication",
    publication_url,
    resolved_publication_url: resolvedOrigin,
    pages_scanned: pagesScanned,
    archive_entries_scanned: archiveEntriesScanned,
    returned: items.length,
    bodies_loaded: include_bodies ? items.length - postErrors.length : 0,
    complete,
    next_offset: complete ? null : currentOffset,
    ...(nonNewsletterSkipped ? {non_newsletter_entries_skipped: nonNewsletterSkipped} : {}),
    ...(invalidEntriesSkipped ? {invalid_entries_skipped: invalidEntriesSkipped} : {}),
    ...(pagesScanned >= MAX_SCAN_PAGES && !complete
      ? {warning: "Scan page budget reached; continue from next_offset."}
      : {}),
    ...(postErrors.length ? {post_errors: postErrors} : {}),
    items,
  };
};
