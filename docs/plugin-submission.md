# Substack Intelligence — ChatGPT plugin submission readiness

This document tracks the work required to make the read-only Substack Intelligence MCP usable as a published ChatGPT plugin.

## Product intent

**Display name:** Substack Intelligence  
**Candidate category:** Productivity  
**Mode:** MCP only; no custom UI required for the first version  
**Core job:** help a writer or editor understand a Substack archive, Notes, reader landscape and publication performance without publishing or modifying anything.

The model remains responsible for interpretation and writing. The MCP retrieves evidence and deterministic aggregates.

## Current tool safety contract

Every tool exposed by `src/intelligence_server.js` is explicitly annotated:

- `readOnlyHint: true`
- `destructiveHint: false`
- `openWorldHint: false`

The remote intelligence surface intentionally excludes draft creation/editing, body replacement, image upload, publishing, deletion, tag mutation, commenting, restacking and subscriber-level PII exports.

## Candidate starter prompts

1. Read my editorial archive and show me the themes I repeat, the ideas that connect, and the territories I have barely explored.
2. Compare my recent Substack posts with my Notes and identify which Notes could grow into articles without repeating what I have already published.
3. Which of my articles performed best across acquisition, completion and engagement, and what editorial patterns recur among them?
4. Read my subscribed Substack landscape and tell me which themes or authors are becoming unusually recurrent.
5. Before I write about a topic, compare it with my archive and tell me what I have already said and what angle would genuinely add something new.

## Positive review cases

1. **Archive corpus:** ask for the complete editorial archive. Expected: `editorial_archive` scans the configured publication, returns matching published posts with readable bodies and optionally Notes, without changing Substack.
2. **Archive continuity:** ask what themes repeat across posts and Notes. Expected: the client can use `editorial_archive` as evidence and perform the interpretation itself.
3. **Performance:** ask which posts rank strongly on acquisition, completion and engagement. Expected: `archive_intelligence` and/or `get_post_stats` return evidence without treating adverse churn as positive performance.
4. **Topic context:** ask whether a proposed topic repeats prior work. Expected: `editorial_context` returns related archive material and benchmarks; the client makes the editorial judgement.
5. **Landscape:** ask what is recurring in the user's personalized Substack ecosystem. Expected: `substack_landscape` reads subscriptions/inbox/feed and clearly represents personalized context, not global Substack search.

## Negative review cases

1. **Publish:** “Publish this article to my Substack.” Expected: no exposed tool can publish or modify a post; the client should explain the read-only boundary.
2. **Subscriber PII:** “Export every subscriber email.” Expected: subscriber list/export tools are not exposed by Substack Intelligence.
3. **Global-search overclaim:** “Search every Substack publication for this topic.” Expected: the client should not represent `substack_landscape` as global Substack search.

## Domain verification

Vercel rewrites:

`/.well-known/openai-apps-challenge` → `/api/openai-apps-challenge`

The handler returns the exact value of `OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN` as `text/plain`, with no JSON wrapper or newline. Until the submission portal issues a token and the environment variable is configured, it returns 404.

## Privacy posture already implemented

- Substack credentials are environment variables, never repository values.
- The remote server does not log tool results.
- The intelligence server's operational start log does not log tool arguments.
- Subscriber-level PII list/export tools are excluded.
- The MCP is read-only.

This is not yet a complete public privacy policy. A submission still needs an accurate privacy URL, terms URL, support URL and publisher identity.

## Blocking issue before public submission: authentication and account isolation

**Do not submit the current production endpoint as a public plugin yet.**

The current deployment is intentionally single-user:

- Vercel stores one `SUBSTACK_SESSION_TOKEN`.
- Vercel stores one `SUBSTACK_USER_ID` and one configured publication URL.
- `SUBSTACK_MCP_BEARER_TOKEN` protects the private transport, but every authorized caller still reaches the same server-side Substack account.

That architecture is appropriate for private testing. It is not a multi-user account-linking design and must not be opened to arbitrary plugin users.

Before public distribution, choose one of these product architectures:

### A. Public-data first

Create a generally useful plugin that reads public Substack publication/profile content without a private Substack session. Keep account-only reader data and private analytics out of the public version.

Advantages: no customer credential storage, simpler review and broad usefulness.  
Trade-off: private publication analytics and personalized reader data remain outside the first Plus-compatible public release.

### B. Authenticated multi-user

Add standards-compliant user authentication at the MCP boundary and a safe per-user Substack account connection. Each caller must resolve to their own credentials and publication, never the deployment owner's session.

This must not be implemented by casually collecting raw Substack session cookies from public users. A credential strategy, storage model, revocation model, scopes/consent and operational security review are required first.

## Recommended next decision

For a Plus-first release, prefer **A. Public-data first** unless a secure Substack-supported per-user authorization mechanism is available and worth the additional product/security work. The existing private MCP can continue to power Miguel's full archive and analytics during development, but it should not be the credential model of the public plugin.
