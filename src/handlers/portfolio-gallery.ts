import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";
import { portfolioStore, serviceStore } from "../data.js";

// Register the View Portfolio button in the main menu
registerMainMenuItem({ label: "🖼️ View Portfolio", data: "portfolio:gallery", order: 20 });

const composer = new Composer<Ctx>();

// Entry point: show portfolio with optional category filter
composer.callbackQuery("portfolio:gallery", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showPortfolioPage(ctx, 0);
});

// Pagination: next/prev
composer.callbackQuery(/^portfolio:page:(next|prev):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match[2]);
  await showPortfolioPage(ctx, page);
});

// Filter by tag/category
composer.callbackQuery(/^portfolio:tag:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tag = ctx.match[1];
  await showPortfolioPage(ctx, 0, tag);
});

// View a specific portfolio item
composer.callbackQuery(/^portfolio:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const itemId = ctx.match[1];
  const item = await portfolioStore.get(itemId);

  if (!item) {
    await ctx.reply("Sorry, that portfolio item isn't available anymore.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to gallery", "portfolio:gallery")]]),
    });
    return;
  }

  // Get related service names
  const serviceNames: string[] = [];
  for (const svcId of item.service_links) {
    const svc = await serviceStore.get(svcId);
    if (svc) serviceNames.push(svc.name);
  }

  const caption = item.caption || "No caption";
  const tags = item.tags.length > 0 ? `Tags: ${item.tags.join(", ")}` : "";
  const related = serviceNames.length > 0 ? `Related services: ${serviceNames.join(", ")}` : "";

  const lines = [caption];
  if (tags) lines.push(tags);
  if (related) lines.push(related);

  await ctx.replyWithPhoto(item.image_url, {
    caption: lines.join("\n\n"),
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to gallery", "portfolio:gallery")],
    ]),
  });
});

async function showPortfolioPage(ctx: Ctx, page: number, tagFilter?: string) {
  let items = await portfolioStore.list();

  if (tagFilter) {
    items = items.filter((item) => item.tags.includes(tagFilter));
  }

  if (items.length === 0) {
    const backRows = [[inlineButton("⬅️ Back to menu", "menu:main")]];
    await ctx.editMessageText(
      tagFilter
        ? `No portfolio items tagged "${tagFilter}" yet.`
        : "Our portfolio is empty — check back soon!",
      { reply_markup: inlineKeyboard(backRows) },
    );
    return;
  }

  const { pageItems, totalPages, page: actualPage, controls } = paginate(items, {
    page,
    perPage: 5,
    callbackPrefix: "portfolio:page",
  });

  // Get unique tags for filtering
  const allTags = [...new Set(items.flatMap((item) => item.tags))].sort();
  const tagButtons = allTags.slice(0, 6).map((t) => inlineButton(t, `portfolio:tag:${t}`));

  const rows = pageItems.map((item) => [
    inlineButton(item.caption.slice(0, 30) || "View image", `portfolio:view:${item.id}`),
  ]);

  // Add tag filter buttons and pagination controls
  const extraRows: (ReturnType<typeof inlineButton>)[][] = [];
  if (tagButtons.length > 0) {
    extraRows.push(tagButtons);
  }
  if (controls.inline_keyboard.length > 0) {
    extraRows.push(...controls.inline_keyboard as (ReturnType<typeof inlineButton>)[][]);
  }
  extraRows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  const header = tagFilter
    ? `Portfolio — filtered by "${tagFilter}" (${items.length} items)`
    : `Portfolio (${items.length} items)`;

  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(header, {
      reply_markup: inlineKeyboard([...rows, ...extraRows]),
    });
  } else {
    await ctx.reply(header, {
      reply_markup: inlineKeyboard([...rows, ...extraRows]),
    });
  }
}

export default composer;
