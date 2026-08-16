import {z} from "zod";
import {listSubscriptionsHandler} from "./list_subscriptions.js";
import {listReaderPostsHandler} from "./list_reader_posts.js";
import {getReaderFeedHandler} from "./get_reader_feed.js";
import {logger} from "../logger.js";

export const substackLandscapeSchema = z.strictObject({
  inbox_limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe("How many recent subscribed-post inbox entries to return, default 50."),
  feed_limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(30)
    .describe("How many entries to return from each requested Notes/feed tab, default 30."),
  subscriptions_limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(100)
    .describe("How many active publication subscriptions to return, default 100."),
  include_for_you: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include the personalized for-you feed in addition to the subscribed feed."),
});

export const substackLandscapeHandler = async (
  args,
  {
    listSubscriptions = listSubscriptionsHandler,
    listReaderPosts = listReaderPostsHandler,
    getReaderFeed = getReaderFeedHandler,
  } = {}
) => {
  const {
    inbox_limit,
    feed_limit,
    subscriptions_limit,
    include_for_you,
  } = substackLandscapeSchema.parse(args);

  logger.debug("substack_landscape.start", {
    inbox_limit,
    feed_limit,
    subscriptions_limit,
    include_for_you,
  });

  const [subscriptions, inbox, subscribedFeed, forYouFeed] = await Promise.all([
    listSubscriptions({limit: subscriptions_limit, active_only: true}),
    listReaderPosts({limit: inbox_limit}),
    getReaderFeed({tab: "subscribed", limit: feed_limit, include_tabs: false}),
    include_for_you
      ? getReaderFeed({tab: "for-you", limit: feed_limit, include_tabs: false})
      : Promise.resolve(null),
  ]);

  const result = {
    scope: "personal_substack_ecosystem",
    subscriptions,
    inbox,
    feeds: {
      subscribed: subscribedFeed,
      ...(forYouFeed ? {for_you: forYouFeed} : {}),
    },
    interpretation_note:
      "This describes the account's personalized Substack ecosystem: subscriptions, recent inbox posts and feed surfaces. It is not a global search of all Substack publications. The calling model should identify authors, recurring topics, emerging signals and gaps, and may supplement this with external web research.",
  };

  logger.info("substack_landscape.done", {
    subscriptions: subscriptions?.returned ?? null,
    inbox_posts: inbox?.returned ?? null,
    subscribed_feed: subscribedFeed?.returned ?? null,
    for_you_feed: forYouFeed?.returned ?? null,
  });

  return result;
};
