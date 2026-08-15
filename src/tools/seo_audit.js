import {z} from "zod";
import {getDraftHandler} from "./get_draft.js";
import {getPostTagsHandler} from "./get_post_tags.js";
import {logger} from "../logger.js";

export const seoAuditSchema = z.strictObject({
  draft_id: z
    .number()
    .int()
    .describe("The numeric id of the draft to audit."),
  focus_phrase: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional exact phrase to check for naturally in the title, description, slug and body. This is a diagnostic, not a keyword-density score."
    ),
});

function bodyText(draftBody) {
  if (!draftBody) return "";

  let value = draftBody;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return value;
    }
  }

  const texts = [];
  const visit = (node) => {
    if (node == null) return;
    if (typeof node === "string") {
      texts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === "object") {
      if (typeof node.text === "string") texts.push(node.text);
      if (Array.isArray(node.content)) node.content.forEach(visit);
    }
  };

  visit(value);
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

function includesPhrase(value, phrase) {
  if (!phrase) return null;
  return String(value ?? "").toLowerCase().includes(phrase.toLowerCase());
}

export const seoAuditHandler = async (
  args,
  {
    getDraft = getDraftHandler,
    getPostTags = getPostTagsHandler,
  } = {}
) => {
  const {draft_id, focus_phrase} = seoAuditSchema.parse(args);
  logger.debug("seo_audit.start", {draft_id, focus_phrase});

  const [draft, tagResult] = await Promise.all([
    getDraft({draft_id}),
    getPostTags({post_id: draft_id}),
  ]);

  const seoTitle = draft?.search_engine_title ?? "";
  const seoDescription = draft?.search_engine_description ?? "";
  const postTitle = draft?.draft_title ?? draft?.title ?? "";
  const subtitle = draft?.draft_subtitle ?? draft?.subtitle ?? "";
  const socialTitle = draft?.social_title ?? "";
  const socialDescription = draft?.description ?? "";
  const slug = draft?.slug ?? "";
  const coverImage = draft?.cover_image ?? "";
  const text = bodyText(draft?.draft_body);
  const tags = tagResult?.tags ?? [];

  const warnings = [];
  const notes = [];

  if (!seoTitle) warnings.push("SEO title is not set explicitly.");
  else if (seoTitle.length > 60) warnings.push("SEO title is longer than 60 characters.");

  if (!seoDescription) warnings.push("SEO description is not set explicitly.");
  else if (seoDescription.length < 50 || seoDescription.length > 160) {
    warnings.push("SEO description is outside the 50–160 character range used by the Substack editor guidance.");
  }

  if (!slug) warnings.push("Slug is missing.");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    warnings.push("Slug is not clean lowercase kebab-case.");
  }

  if (!coverImage) notes.push("No cover image is set.");
  if (!socialTitle) notes.push("No separate social title is set; Substack may fall back to the post title.");
  if (!socialDescription) notes.push("No separate social description is set.");
  if (tags.length === 0) notes.push("The post has no tags.");
  if (!text) warnings.push("Draft body is empty or could not be read.");

  const focus = focus_phrase
    ? {
        phrase: focus_phrase,
        in_post_title: includesPhrase(postTitle, focus_phrase),
        in_seo_title: includesPhrase(seoTitle, focus_phrase),
        in_seo_description: includesPhrase(seoDescription, focus_phrase),
        in_slug: includesPhrase(slug.replace(/-/g, " "), focus_phrase),
        in_body: includesPhrase(text, focus_phrase),
      }
    : null;

  const result = {
    draft_id,
    fields: {
      post_title: postTitle,
      subtitle,
      seo_title: seoTitle,
      seo_title_length: seoTitle.length,
      seo_description: seoDescription,
      seo_description_length: seoDescription.length,
      social_title: socialTitle,
      social_description: socialDescription,
      slug,
      cover_image: coverImage || null,
      tags,
      body_characters: text.length,
    },
    focus_phrase: focus,
    warnings,
    notes,
    ready_for_editorial_review: warnings.length === 0,
    interpretation_note:
      "This is a deterministic metadata and presence audit. It does not judge search intent, competition, originality or whether the article deserves to rank; the calling model should research those externally.",
  };

  logger.info("seo_audit.done", {draft_id, warnings: warnings.length, notes: notes.length});
  return result;
};
