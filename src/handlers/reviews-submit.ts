import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { reviewStore } from "../data.js";

// Register the Submit Review button in the main menu
registerMainMenuItem({ label: "⭐ Submit Review", data: "reviews:submit", order: 30 });

const composer = new Composer<Ctx>();

// Helper: generate a unique review ID
function generateReviewId(): string {
  return "RV-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Entry point: show review options
composer.callbackQuery("reviews:submit", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.review_step = "rating";

  await ctx.reply(
    "We'd love your feedback!\n\nHow was your experience? Tap a star rating below:",
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("⭐", "reviews:rate:1"),
          inlineButton("⭐⭐", "reviews:rate:2"),
          inlineButton("⭐⭐⭐", "reviews:rate:3"),
          inlineButton("⭐⭐⭐⭐", "reviews:rate:4"),
          inlineButton("⭐⭐⭐⭐⭐", "reviews:rate:5"),
        ],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Step 1: Collect rating
composer.callbackQuery(/^reviews:rate:(\d)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const rating = parseInt(ctx.match[1]);
  ctx.session.review_step = "text";

  // Store rating in session temporarily
  (ctx.session as Record<string, unknown>).review_rating = rating;

  const stars = "⭐".repeat(rating);
  await ctx.reply(
    `${stars} — great!\n\nTell us more about your experience (or tap Skip to submit just the rating):`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Skip", "reviews:skip_text")],
      ]),
    },
  );
});

// Step 2: Collect text review
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.review_step !== "text") return next();

  const text = ctx.message.text.trim();
  (ctx.session as Record<string, unknown>).review_text = text;
  ctx.session.review_step = "photos";

  await ctx.reply(
    "Thanks for your words! You can add a photo of your result, or tap Done to finish:",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Done", "reviews:done")],
      ]),
    },
  );
});

// Skip text, go straight to photos
composer.callbackQuery("reviews:skip_text", async (ctx) => {
  await ctx.answerCallbackQuery();
  (ctx.session as Record<string, unknown>).review_text = "";
  ctx.session.review_step = "photos";

  await ctx.reply(
    "No problem! You can add a photo of your result, or tap Done to finish:",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Done", "reviews:done")],
      ]),
    },
  );
});

// Collect photo
composer.on("message:photo", async (ctx) => {
  if (ctx.session.review_step !== "photos") return;

  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const urls = ((ctx.session as Record<string, unknown>).review_photos as string[]) ?? [];
  urls.push(photo.file_id);
  (ctx.session as Record<string, unknown>).review_photos = urls;

  await ctx.reply(
    `Photo added! Send another or tap Done to finish (${urls.length} photo${urls.length > 1 ? "s" : ""}):`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Done", "reviews:done")],
      ]),
    },
  );
});

// Finalize review
composer.callbackQuery("reviews:done", async (ctx) => {
  await ctx.answerCallbackQuery();

  const rating = (ctx.session as Record<string, unknown>).review_rating as number;
  const text = ((ctx.session as Record<string, unknown>).review_text as string) ?? "";
  const photos = ((ctx.session as Record<string, unknown>).review_photos as string[]) ?? [];

  const reviewId = generateReviewId();
  await reviewStore.set({
    id: reviewId,
    user_id: ctx.from.id,
    rating,
    text,
    photo_urls: photos,
    timestamp: new Date().toISOString(),
    admin_reply: "",
  });

  // Clear review session state
  ctx.session.review_step = undefined;
  (ctx.session as Record<string, unknown>).review_rating = undefined;
  (ctx.session as Record<string, unknown>).review_text = undefined;
  (ctx.session as Record<string, unknown>).review_photos = undefined;

  const stars = "⭐".repeat(rating);
  const photoNote = photos.length > 0 ? `\n${photos.length} photo(s) attached` : "";

  await ctx.reply(
    `Thanks for your review!\n\n${stars}${photoNote}\nReview ID: ${reviewId}\n\nYour feedback helps us improve. We appreciate you!`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// View all reviews (read-only)
composer.callbackQuery("reviews:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  const reviews = await reviewStore.list();

  if (reviews.length === 0) {
    await ctx.reply("No reviews yet — be the first to share your experience!", {
      reply_markup: inlineKeyboard([
        [inlineButton("⭐ Submit Review", "reviews:submit")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const recent = reviews.slice(-5).reverse();
  const lines = recent.map((r) => {
    const stars = "⭐".repeat(r.rating);
    const text = r.text ? ` — "${r.text.slice(0, 50)}${r.text.length > 50 ? "…" : ""}"` : "";
    return `${stars}${text}`;
  });

  await ctx.reply(`Recent reviews (${reviews.length} total):\n\n${lines.join("\n\n")}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Cancel review flow
composer.callbackQuery("reviews:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.review_step = undefined;
  (ctx.session as Record<string, unknown>).review_rating = undefined;
  (ctx.session as Record<string, unknown>).review_text = undefined;
  (ctx.session as Record<string, unknown>).review_photos = undefined;

  await ctx.editMessageText("Review cancelled. Tap /start to begin again.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
