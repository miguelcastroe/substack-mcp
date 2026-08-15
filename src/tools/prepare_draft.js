import {z} from "zod";
import {createDraftPostHandler} from "./create_draft_post.js";
import {updateDraftHandler} from "./update_draft.js";
import {addTagToPostHandler} from "./add_tag_to_post.js";
import {logger} from "../logger.js";

export const prepareDraftSchema = z.strictObject({
  title: z.string().min(1).describe("The post title."),
  subtitle: z.string().optional().default("").describe("The post subtitle, default empty."),
  body: z
    .string()
    .describe(
      "The post body. Plain text is accepted. A JSON string containing a valid Substack document is also accepted for structured content; use the set_post_body schema as the node vocabulary."
    ),
  audience: z.enum(["everyone", "only_paid", "only_free", "founding"]).optional(),
  write_comment_permissions: z.enum(["everyone", "subscribers", "only_paid", "none"]).optional(),
  default_comment_sort: z.enum(["best_first", "most_recent_first", "oldest_first"]).optional(),
  cover_image: z.string().url().optional(),
  social_title: z.string().optional(),
  description: z.string().optional(),
  search_engine_title: z.string().optional(),
  search_engine_description: z.string().optional(),
  slug: z.string().optional(),
  tags: z
    .array(z.string().min(1))
    .max(10)
    .optional()
    .default([])
    .describe("Tags to attach after creating the draft, maximum 10."),
  create_missing_tags: z
    .boolean()
    .optional()
    .default(true)
    .describe("Create tags that do not already exist, default true."),
});

export const prepareDraftHandler = async (
  args,
  {
    createDraft = createDraftPostHandler,
    updateDraft = updateDraftHandler,
    addTag = addTagToPostHandler,
  } = {}
) => {
  const validated = prepareDraftSchema.parse(args);
  const {
    title,
    subtitle,
    body,
    tags,
    create_missing_tags,
    ...settings
  } = validated;

  logger.info("prepare_draft.start", {
    title,
    tags: tags.length,
    settings: Object.keys(settings),
  });

  let draftId = null;

  try {
    const created = await createDraft({title, subtitle, body});
    draftId = created?.draft_id ?? null;

    if (draftId == null) {
      throw new Error("create_draft_post returned no draft_id");
    }

    let updated = null;
    const settingsToWrite = Object.fromEntries(
      Object.entries(settings).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(settingsToWrite).length > 0) {
      updated = await updateDraft({draft_id: draftId, ...settingsToWrite});
    }

    const tagResults = [];
    for (const tagName of tags) {
      const tagResult = await addTag({
        post_id: draftId,
        tag_name: tagName,
        create_if_missing: create_missing_tags,
      });
      tagResults.push(tagResult);
    }

    const result = {
      status: "prepared",
      draft_id: draftId,
      settings_updated: updated?.updated_fields ?? [],
      tags: tagResults,
      published: false,
      email_sent: false,
      safety_note:
        "prepare_draft never publishes and never emails subscribers. Use publish_draft separately and pass send: true only when email delivery is explicitly intended.",
    };

    logger.info("prepare_draft.done", {
      draft_id: draftId,
      settings_updated: result.settings_updated.length,
      tags: tagResults.length,
    });

    return result;
  } catch (error) {
    logger.error("prepare_draft.error", {draft_id: draftId, error});
    if (draftId != null) {
      throw new Error(
        `prepare_draft failed after creating draft ${draftId}. The draft was preserved for recovery. ${error.message}`
      );
    }
    throw error;
  }
};
