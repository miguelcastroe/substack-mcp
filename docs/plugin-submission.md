# Substack Intelligence — ChatGPT plugin submission readiness

This document tracks the work required to publish the public, read-only Substack Intelligence MCP as a ChatGPT plugin.

## Product intent

**Display name:** Substack Intelligence  
**Candidate category:** Productivity  
**Mode:** MCP only; no custom UI required for the first version  
**Core job:** help a writer, editor or reader understand a public Substack archive as a connected body of ideas without publishing or modifying anything.

The model remains responsible for interpretation and writing. The MCP retrieves evidence.

## Public submission surface

**Universal MCP URL:** `https://substack-intelligence.vercel.app/api/public-mcp`

The public MCP is deliberately separate from the private development MCP. It exposes only `public_editorial_archive`, which reads public Substack archive/post data and does not require a Substack session, user id or private transport bearer.

Public listing URLs:

- Website: `https://substack-intelligence.vercel.app/`
- Support: `https://substack-intelligence.vercel.app/support`
- Privacy: `https://substack-intelligence.vercel.app/privacy`
- Terms: `https://substack-intelligence.vercel.app/terms`

The private `/api/mcp` endpoint must not be submitted as the public plugin.

## Public tool safety contract

`public_editorial_archive` is explicitly annotated:

- `readOnlyHint: true`
- `destructiveHint: false`
- `openWorldHint: true`

`openWorldHint` is true because the caller can choose a public internet URL. The tool remains read-only and cannot change public state.

The public surface exposes no draft creation/editing, publishing, deletion, comments, restacks, subscriber data, private reader feed, or private publication analytics.

## Candidate starter prompts

1. Read this Substack archive and show me the themes it repeats, the ideas that connect, and the territories it has barely explored.
2. Read the last 20 posts from this publication and tell me which arguments recur without adding a new layer.
3. Map this Substack archive into a small set of editorial territories and show me the strongest connections between them.
4. Before I write about this topic, compare it with this public Substack archive and tell me what has already been said there.
5. Find the questions this publication keeps approaching but has not yet developed into a full argument.

## Positive review cases

1. **Archive corpus:** provide a public Substack publication URL and ask for its editorial archive. Expected: `public_editorial_archive` returns normalized public posts without modifying anything.
2. **Post URL input:** provide a URL to one post within a Substack publication and ask to review the publication archive. Expected: the tool reduces the input to the publication origin and scans the archive.
3. **Editorial continuity:** ask what themes recur across the archive. Expected: the model uses the returned bodies/previews as evidence and performs the interpretation itself.
4. **Paid post:** include an archive containing a paid post. Expected: the tool clearly marks the retrieved body as `public_preview` rather than claiming access to subscriber-only content.
5. **Continuation:** ask for an archive larger than one call's requested post budget. Expected: the client can follow `next_offset` without asking the user to copy an offset or JSON payload.

## Negative review cases

1. **Publish:** “Publish this article to that Substack.” Expected: no exposed public tool can publish or modify a post.
2. **Private analytics:** “Show me the publication's subscriber conversion and open-rate data.” Expected: the public tool does not claim access to private analytics.
3. **Private account content:** “Read this publication's drafts or subscriber-only article body.” Expected: the public tool does not claim private account access and only returns what the public endpoint exposes.

## Domain verification

Vercel rewrites:

`/.well-known/openai-apps-challenge` → `/api/openai-apps-challenge`

The handler returns the exact value of `OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN` as `text/plain`, with no JSON wrapper or newline. Until the submission portal issues a token and the environment variable is configured, it returns 404.

## Privacy posture already implemented

- The public plugin does not use the deployment owner's Substack session.
- The public remote server does not log tool results.
- Central tool logs record tool name/duration rather than response bodies.
- The public tool accepts public publication URLs only and guards outbound requests against private/loopback destinations.
- Subscriber PII, drafts, private reader data and private analytics are excluded.
- The MCP is read-only.
- Website, support, privacy and terms pages are hosted on the same production domain.

## Submission steps still requiring the OpenAI Platform portal

1. Use an OpenAI Platform organization with Apps Management write access.
2. Complete individual or business identity verification for the publisher name.
3. Create a plugin draft and choose **With MCP**.
4. Use **Universal** and enter `https://substack-intelligence.vercel.app/api/public-mcp`.
5. Choose no account authentication for this first public-data version.
6. Enter the public listing URLs above and upload the final logo.
7. When the portal generates a domain verification token, set it in Vercel as `OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN`, redeploy, and verify the challenge.
8. Select **Scan Tools**, review the discovered tool and annotations, fix any validation issues, and rescan.
9. Add the starter prompts, five positive cases, three negative cases, country availability and release notes.
10. Submit for review.

## Private capabilities remain separate

The existing private MCP can still power Miguel's own Notes, personalized reader landscape, archive hydration and publication analytics during development. It remains protected by a private bearer and one private Substack session, and is not the credential model of the public plugin.
