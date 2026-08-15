import {z} from "zod";
import {listPostsHandler} from "./list_posts.js";
import {getPostStatsHandler} from "./get_post_stats.js";
import {logger} from "../logger.js";

const BENCHMARK_METRICS = [
  "signups",
  "subscribers_finished_post",
  "estimated_value",
  "unsubscribes",
];

export const editorialContextSchema = z.strictObject({
  topic: z
    .string()
    .min(1)
    .describe("The topic, phrase or idea to look for in your own Substack archive."),
  archive_limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe("Maximum matching published posts and drafts to return per status, default 10."),
  include_drafts: z
    .boolean()
    .optional()
    .default(true)
    .describe("Also search unpublished drafts, default true."),
  benchmark_limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("How many top posts to return for each performance benchmark, default 5."),
});

function compactStat(post) {
  const fields = [
    "post_id",
    "title",
    "post_date",
    "audience",
    "tags",
    "signups",
    "subscribes",
    "unsubscribes",
    "views",
    "subscribers_finished_post",
    "estimated_value",
    "open_rate",
    "click_through_rate",
    "likes",
    "shares",
    "restacks",
    "engagement_rate",
  ];

  return Object.fromEntries(
    fields.filter((field) => post?.[field] !== undefined).map((field) => [field, post[field]])
  );
}

export const editorialContextHandler = async (
  args,
  {
    listPosts = listPostsHandler,
    getPostStats = getPostStatsHandler,
  } = {}
) => {
  const validated = editorialContextSchema.parse(args);
  const {topic, archive_limit, include_drafts, benchmark_limit} = validated;

  logger.debug("editorial_context.start", {topic, archive_limit, include_drafts, benchmark_limit});

  const publishedPromise = listPosts({
    status: "published",
    search: topic,
    limit: archive_limit,
  });

  const draftsPromise = include_drafts
    ? listPosts({status: "drafts", search: topic, limit: archive_limit})
    : Promise.resolve(null);

  const benchmarkPromises = BENCHMARK_METRICS.map(async (metric) => {
    const result = await getPostStats({
      order_by: metric,
      order_direction: "desc",
      limit: benchmark_limit,
    });

    return [metric, (result?.posts ?? []).map(compactStat)];
  });

  const [published, drafts, benchmarkEntries] = await Promise.all([
    publishedPromise,
    draftsPromise,
    Promise.all(benchmarkPromises),
  ]);

  const result = {
    topic,
    archive: {
      published_total_matches: published?.total ?? null,
      published_matches: published?.posts ?? [],
      draft_total_matches: drafts?.total ?? null,
      draft_matches: drafts?.posts ?? [],
    },
    performance_benchmarks: Object.fromEntries(benchmarkEntries),
    interpretation_note:
      "These are retrieval and performance signals, not an editorial verdict. The calling model should decide whether the topic is repetitive, underexplored, strategically useful or worth a new angle.",
  };

  logger.info("editorial_context.done", {
    topic,
    published_matches: result.archive.published_matches.length,
    draft_matches: result.archive.draft_matches.length,
  });

  return result;
};
