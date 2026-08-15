# Editorial Intelligence layer

This fork keeps the upstream `substack-mcp` server intact and adds a second MCP entrypoint for editorial work.

## Why it is separate

Substack is the source of truth for the publication, archive, drafts, audience and performance. External search engines and the wider web are not. The editorial server therefore does not embed a general web-search provider or pretend to do SERP research itself.

Use a search-capable LLM client for external research, then use this MCP for Substack context, composition, metadata, publishing and analytics.

## Entry points

- `substack-mcp` / `npm start`: upstream-compatible server.
- `substack-editorial-mcp` / `npm run start:editorial`: upstream tools plus the editorial layer.

The same environment variables are required:

- `SUBSTACK_PUBLICATION_URL`
- `SUBSTACK_SESSION_TOKEN`
- `SUBSTACK_USER_ID`

From a source checkout:

```bash
npm install
SUBSTACK_PUBLICATION_URL="https://your-publication.substack.com" \
SUBSTACK_SESSION_TOKEN="..." \
SUBSTACK_USER_ID="..." \
npm run start:editorial
```

For an MCP client, point the command at `node` and the argument at the absolute path to `src/editorial_index.js`, with the same three environment variables.

## Added tools

### `editorial_context`

Use before writing about a topic. It searches your own published archive and optional drafts for the topic, then returns benchmark rankings for:

- signups
- subscribers finishing the post
- estimated value
- unsubscribes

The tool gathers evidence. The calling model decides whether the proposed article repeats old work, extends it or opens a genuinely different angle.

### `archive_intelligence`

Compares post rankings across selected metrics and identifies posts that recur near the top of more than one dimension. Default dimensions cover acquisition, value, completion, reach and churn.

The output labels metric semantics explicitly. `unsubscribes` is an adverse signal, so a post that ranks highly for both acquisition and churn is surfaced as something worth investigating, not described as a winner.

This is useful for questions such as:

- Which posts recur across more than one outcome?
- What has historically grown the list versus merely generated views?
- Which pieces combine reading depth with acquisition?
- Which high-acquisition posts also created unusual churn?

Cross-metric recurrence is a signal, not a quality score or a causal explanation.

### `seo_audit`

Reads a draft and performs deterministic checks on:

- explicit SEO title and its length
- explicit SEO description and its length
- slug hygiene
- cover image
- social title and description
- tags
- body presence
- optional exact focus phrase presence

It deliberately does **not** score originality, search intent, keyword difficulty, competitor quality or the likelihood of ranking. Those require external research and editorial judgement.

### `prepare_draft`

Creates a draft and applies its settings in one operation:

- title and subtitle
- plain text or structured Substack document body
- audience
- comment settings
- cover image
- social title and description
- SEO title and description
- slug
- tags

`prepare_draft` never publishes and never sends email. Publishing remains a separate call to `publish_draft`, whose `send` flag must be explicitly set to `true` to email subscribers.

If the draft is created successfully but a later setting or tag fails, the draft is preserved and the error includes the draft id for recovery.

## Recommended editorial workflow

1. Research the external landscape with a search-capable client.
2. Call `editorial_context` for topic-specific history inside your own publication.
3. Call `archive_intelligence` when historical performance should influence the decision.
4. Develop and edit the article in the LLM client.
5. Call `prepare_draft` with the approved body and metadata.
6. Call `seo_audit` and resolve deterministic warnings.
7. Review the draft in Substack.
8. Call `publish_draft` only when publication is explicitly approved; set `send: true` only when subscriber email delivery is explicitly intended.
9. Use the existing `get_post_stats` and `get_analytics` tools after publication to close the learning loop.

## Validation

The fork keeps the upstream pull-request test workflow. It runs the complete Node test suite on the development runtime and again on the declared Node 22 engine floor before the editorial layer should be merged.

## Design principle

The MCP should expose reliable evidence and safe write operations. The LLM should perform the editorial reasoning. Keeping those roles separate makes the system easier to audit, easier to update from upstream and less likely to turn editorial judgement into opaque hard-coded heuristics.
