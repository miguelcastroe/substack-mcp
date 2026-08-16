# Public Substack Intelligence

This surface exists so a published ChatGPT app can analyze public Substack publications without using the deployment owner's private Substack session.

## Endpoint

`/api/public-mcp`

The endpoint is deliberately separate from the private `/api/mcp` deployment:

- it requires no `SUBSTACK_SESSION_TOKEN`
- it requires no `SUBSTACK_USER_ID`
- it does not use `SUBSTACK_MCP_BEARER_TOKEN`
- it exposes no private reader, draft, analytics or subscriber data
- it exposes only read-only public-web tools

## Tool: `public_editorial_archive`

Input: a public Substack publication URL (substack.com subdomain or custom domain).

The tool:

1. reduces a post URL to the publication origin when necessary
2. scans the public `/api/v1/archive` surface in bounded pages
3. keeps newsletter posts by default
4. optionally hydrates each post through the publication's public post endpoint
5. returns normalized metadata plus the public body Substack exposes
6. marks paid-post bodies as `public_preview`
7. returns `next_offset` when the requested `max_posts` is reached before archive exhaustion

The MCP client can follow `next_offset` automatically. The user should never need to copy an id, cursor or JSON payload between the app and ChatGPT.

## Network safety

The tool accepts a caller-selected public URL, so every outbound request is guarded against loopback/private/link-local destinations. Redirects are followed manually and validated hop by hop. Responses are bounded and parsed as JSON.

## What this first public surface intentionally does not include

- private publication analytics
- drafts
- subscriber data
- the signed-in reader inbox/feed
- private or paid bodies beyond what Substack exposes publicly
- publishing or any mutation

Public Notes are not part of this first tool yet. They should be added only after the anonymous public-profile path is verified independently and can be kept separate from account-authenticated reader data.

## Intended ChatGPT interaction

A user should be able to say:

> Read this Substack archive and tell me what themes repeat, what ideas connect and what territories are underexplored.

ChatGPT calls `public_editorial_archive`, continues automatically if `next_offset` is present, and performs the editorial interpretation in the conversation.
