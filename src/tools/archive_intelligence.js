import {z} from "zod";
import {getPostStatsHandler} from "./get_post_stats.js";
import {logger} from "../logger.js";

export const ARCHIVE_INTELLIGENCE_METRICS = [
  "signups",
  "subscribes",
  "estimated_value",
  "subscribers_finished_post",
  "views",
  "shares",
  "restacks",
  "unsubscribes",
];

const DEFAULT_METRICS = [
  "signups",
  "estimated_value",
  "subscribers_finished_post",
  "views",
  "unsubscribes",
];

const METRIC_SEMANTICS = {
  signups: {direction: "positive", meaning: "free subscriber acquisition"},
  subscribes: {direction: "positive", meaning: "paid subscription conversion"},
  estimated_value: {direction: "positive", meaning: "estimated subscriber value attributed to the post"},
  subscribers_finished_post: {direction: "positive", meaning: "subscriber completion"},
  views: {direction: "positive", meaning: "reach"},
  shares: {direction: "positive", meaning: "sharing"},
  restacks: {direction: "positive", meaning: "Substack network amplification"},
  unsubscribes: {direction: "adverse", meaning: "subscriber churn attributed to the post"},
};

export const archiveIntelligenceSchema = z.strictObject({
  metrics: z
    .array(z.enum(ARCHIVE_INTELLIGENCE_METRICS))
    .min(1)
    .max(8)
    .optional()
    .default(DEFAULT_METRICS)
    .describe(
      "Performance dimensions to compare. Defaults to acquisition, value, completion, reach and churn."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe("How many top-ranked posts to retrieve for each metric, default 10."),
});

function compact(post) {
  const fields = [
    "post_id",
    "title",
    "post_date",
    "audience",
    "tags",
    "signups",
    "subscribes",
    "estimated_value",
    "subscribers_finished_post",
    "views",
    "shares",
    "restacks",
    "unsubscribes",
    "open_rate",
    "click_through_rate",
  ];

  return Object.fromEntries(
    fields.filter((field) => post?.[field] !== undefined).map((field) => [field, post[field]])
  );
}

export const archiveIntelligenceHandler = async (
  args,
  {getPostStats = getPostStatsHandler} = {}
) => {
  const validated = archiveIntelligenceSchema.parse(args);
  const metrics = [...new Set(validated.metrics)];
  const {limit} = validated;

  logger.debug("archive_intelligence.start", {metrics, limit});

  const entries = await Promise.all(
    metrics.map(async (metric) => {
      const result = await getPostStats({
        order_by: metric,
        order_direction: "desc",
        limit,
      });
      return [metric, (result?.posts ?? []).map(compact)];
    })
  );

  const rankings = Object.fromEntries(entries);
  const appearances = new Map();

  for (const [metric, posts] of entries) {
    posts.forEach((post, index) => {
      if (post.post_id == null) return;
      const current = appearances.get(post.post_id) ?? {
        post_id: post.post_id,
        title: post.title ?? null,
        post_date: post.post_date ?? null,
        ranks: {},
      };
      current.ranks[metric] = index + 1;
      appearances.set(post.post_id, current);
    });
  }

  const recurring_posts = [...appearances.values()]
    .map((post) => {
      const ranks = Object.values(post.ranks);
      return {
        ...post,
        metrics_present: ranks.length,
        average_rank: ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length,
        adverse_metrics: Object.keys(post.ranks).filter(
          (metric) => METRIC_SEMANTICS[metric]?.direction === "adverse"
        ),
      };
    })
    .filter((post) => post.metrics_present > 1)
    .sort(
      (a, b) =>
        b.metrics_present - a.metrics_present ||
        a.average_rank - b.average_rank
    );

  const result = {
    metrics,
    metric_semantics: Object.fromEntries(metrics.map((metric) => [metric, METRIC_SEMANTICS[metric]])),
    limit,
    rankings,
    recurring_posts,
    interpretation_note:
      "Recurring posts appear near the top of more than one selected metric. Some metrics, especially unsubscribes, are adverse signals. Recurrence shows where attention is warranted; it is not a quality score or a causal explanation.",
  };

  logger.info("archive_intelligence.done", {
    metrics: metrics.length,
    recurring_posts: recurring_posts.length,
  });

  return result;
};
