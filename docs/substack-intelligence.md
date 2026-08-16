# Substack Intelligence — read-only mode

This mode is designed for editorial intelligence, not publishing.

Its job is to let an MCP client understand:

- what the account is subscribed to
- what is appearing in the reader Inbox
- what is appearing in subscribed and for-you feeds
- what the user's own publication has already published or drafted
- which posts rank highly across acquisition, reach, completion, value and churn metrics
- publication-level analytics and trends
- comments, tags and public/profile context

The calling model performs the interpretation, research synthesis and writing. This server only retrieves evidence.

## Explicitly excluded

The read-only server does **not** expose:

- draft creation
- draft editing
- body replacement
- image upload
- publishing
- deletion
- tag mutation
- commenting
- restacking
- subscriber-level exports

Subscriber-level list/export tools are also excluded from the first version even though they are technically reads, because the editorial use case does not require exposing subscriber PII.

## High-level tools

### `substack_landscape`

Returns the account's personalized Substack ecosystem in one call:

- active subscriptions
- recent subscribed-post Inbox entries
- subscribed Notes/feed entries
- optional for-you feed entries

This is **not** a global search of all Substack. It represents what this account follows and what Substack is surfacing to it. External web research can complement it.

### `editorial_context`

Searches the user's own publication for related work and adds performance benchmarks.

### `archive_intelligence`

Compares post rankings across KPI dimensions and marks churn metrics as adverse signals rather than treating every high rank as positive.

### `seo_audit`

Reads an existing draft and audits metadata without changing it.

## Remote Vercel endpoint

`api/mcp.js` exposes the read-only MCP over Streamable HTTP for Vercel Functions using the MCP SDK already included by the project.

The endpoint requires all four environment variables:

- `SUBSTACK_PUBLICATION_URL`
- `SUBSTACK_SESSION_TOKEN`
- `SUBSTACK_USER_ID`
- `SUBSTACK_MCP_BEARER_TOKEN`

The fourth value is a temporary transport-level guard for private testing. It must be a long random secret stored only in Vercel's encrypted environment variables and the authorized MCP client. Do not commit it or paste it into conversational prompts.

A safe `GET /api/health` endpoint reports only whether configuration is complete; it never returns credential values or Substack content.

## Privacy and logs

The read-only remote server deliberately does not log tool results. Full reader posts, drafts and analytics can contain private publication data, so Vercel runtime logs should contain operational metadata only.

## Intended ChatGPT experience

The target interaction remains inside ChatGPT:

1. The user asks about a theme, author, signal or possible article.
2. ChatGPT uses normal web research when useful.
3. ChatGPT calls Substack Intelligence for personalized Substack context.
4. It crosses that landscape with the user's own archive and KPIs.
5. The discussion, editorial judgement and writing remain in ChatGPT.

No OpenAI API call is required by this MCP server itself.
