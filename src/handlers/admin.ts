import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { serviceStore, bookingStore, portfolioStore, reviewStore, adminStore } from "../data.js";
import type { Service, PortfolioItem } from "../data-types.js";

const composer = new Composer<Ctx>();

// Helper: generate unique IDs
function generateId(prefix: string): string {
  return prefix + "-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Check if user is admin
async function isAdmin(userId: number): Promise<boolean> {
  const admins = await adminStore.list();
  return admins.some((a) => a.telegram_id === userId);
}

// Register as admin (first user to call /admin becomes admin)
composer.command("admin", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("Something went wrong. Try again.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const userId = ctx.from.id;
  const existingAdmin = await adminStore.list();
  const isAlreadyAdmin = existingAdmin.some((a) => a.telegram_id === userId);

  if (!isAlreadyAdmin && existingAdmin.length > 0) {
    await ctx.reply(
      "You're not an admin. Only existing admins can access this dashboard.",
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  // Auto-register first user as admin
  if (!isAlreadyAdmin) {
    await adminStore.set({
      id: `admin_${userId}`,
      telegram_id: userId,
      permissions: ["manage_services", "manage_portfolio", "manage_reviews", "view_bookings"],
    });
  }

  await ctx.reply("Admin Dashboard", {
    reply_markup: inlineKeyboard([
      [inlineButton("Manage Services", "admin:services"), inlineButton("Manage Portfolio", "admin:portfolio")],
      [inlineButton("View Bookings", "admin:bookings"), inlineButton("Moderate Reviews", "admin:reviews")],
      [inlineButton("Add Admin", "admin:add_admin")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// --- Services Management ---

composer.callbackQuery("admin:services", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) {
    await ctx.reply("Access denied.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) });
    return;
  }

  const services = await serviceStore.list();
  const rows = services.map((svc) => [
    inlineButton(`${svc.name} ($${svc.price})`, `admin:svc:${svc.id}`),
  ]);
  rows.push([inlineButton("➕ Add Service", "admin:add_service")]);
  rows.push([inlineButton("⬅️ Back to dashboard", "admin")]);

  await ctx.reply(`Services (${services.length}):`, { reply_markup: inlineKeyboard(rows) });
});

composer.callbackQuery(/^admin:svc:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const svcId = ctx.match[1];
  const svc = await serviceStore.get(svcId);
  if (!svc) {
    await ctx.reply("Service not found.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:services")]]) });
    return;
  }

  await ctx.reply(
    `${svc.name}\nCategory: ${svc.category}\nDuration: ${svc.duration} min\nPrice: $${svc.price}\nSlots: ${svc.slots.join(", ")}\n\n${svc.description}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🗑 Delete", `admin:del_svc:${svc.id}`)],
        [inlineButton("⬅️ Back to services", "admin:services")],
      ]),
    },
  );
});

composer.callbackQuery(/^admin:del_svc:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const svcId = ctx.match[1];
  await serviceStore.delete(svcId);

  await ctx.editMessageText("Service deleted.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to services", "admin:services")]]),
  });
});

// Add service flow
composer.callbackQuery("admin:add_service", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  ctx.session.admin_action = "add_service";
  (ctx.session as Record<string, unknown>).add_svc_step = "name";
  await ctx.reply("What's the service name?", {
    reply_markup: { force_reply: true, input_field_placeholder: "e.g. Deep Tissue Massage" },
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.admin_action !== "add_service") return next();

  const step = (ctx.session as Record<string, unknown>).add_svc_step as string;
  const text = ctx.message.text.trim();

  if (step === "name") {
    (ctx.session as Record<string, unknown>).add_svc_name = text;
    (ctx.session as Record<string, unknown>).add_svc_step = "category";
    await ctx.reply("What category?", {
      reply_markup: { force_reply: true, input_field_placeholder: "e.g. Hair, Skin, Nails" },
    });
  } else if (step === "category") {
    (ctx.session as Record<string, unknown>).add_svc_category = text;
    (ctx.session as Record<string, unknown>).add_svc_step = "duration";
    await ctx.reply("Duration in minutes?", {
      reply_markup: { force_reply: true, input_field_placeholder: "e.g. 30" },
    });
  } else if (step === "duration") {
    const duration = parseInt(text);
    if (isNaN(duration) || duration <= 0) {
      await ctx.reply("Please enter a valid number of minutes.");
      return;
    }
    (ctx.session as Record<string, unknown>).add_svc_duration = duration;
    (ctx.session as Record<string, unknown>).add_svc_step = "price";
    await ctx.reply("Price in dollars?", {
      reply_markup: { force_reply: true, input_field_placeholder: "e.g. 45" },
    });
  } else if (step === "price") {
    const price = parseInt(text);
    if (isNaN(price) || price < 0) {
      await ctx.reply("Please enter a valid price.");
      return;
    }
    (ctx.session as Record<string, unknown>).add_svc_price = price;
    (ctx.session as Record<string, unknown>).add_svc_step = "description";
    await ctx.reply("Brief description?", {
      reply_markup: { force_reply: true, input_field_placeholder: "What the service includes" },
    });
  } else if (step === "description") {
    const newService: Service = {
      id: generateId("svc"),
      name: (ctx.session as Record<string, unknown>).add_svc_name as string,
      category: (ctx.session as Record<string, unknown>).add_svc_category as string,
      duration: (ctx.session as Record<string, unknown>).add_svc_duration as number,
      price: (ctx.session as Record<string, unknown>).add_svc_price as number,
      description: text,
      slots: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
    };

    await serviceStore.set(newService);
    ctx.session.admin_action = "idle";

    await ctx.reply(`Service "${newService.name}" added!`, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to services", "admin:services")]]),
    });
  }
});

// --- Portfolio Management ---

composer.callbackQuery("admin:portfolio", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const items = await portfolioStore.list();
  const rows = items.map((item) => [
    inlineButton(item.caption.slice(0, 30) || "Image", `admin:pf:${item.id}`),
  ]);
  rows.push([inlineButton("➕ Add Image", "admin:add_portfolio")]);
  rows.push([inlineButton("⬅️ Back to dashboard", "admin")]);

  await ctx.reply(`Portfolio (${items.length}):`, { reply_markup: inlineKeyboard(rows) });
});

composer.callbackQuery(/^admin:pf:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const itemId = ctx.match[1];
  const item = await portfolioStore.get(itemId);
  if (!item) {
    await ctx.reply("Portfolio item not found.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:portfolio")]]) });
    return;
  }

  await ctx.reply(
    `${item.caption}\nTags: ${item.tags.join(", ") || "none"}\nServices: ${item.service_links.join(", ") || "none"}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🗑 Delete", `admin:del_pf:${item.id}`)],
        [inlineButton("⬅️ Back to portfolio", "admin:portfolio")],
      ]),
    },
  );
});

composer.callbackQuery(/^admin:del_pf:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const itemId = ctx.match[1];
  await portfolioStore.delete(itemId);

  await ctx.editMessageText("Portfolio item deleted.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to portfolio", "admin:portfolio")]]),
  });
});

// Add portfolio flow (simplified: ask for caption, tags, service links)
composer.callbackQuery("admin:add_portfolio", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  ctx.session.admin_action = "add_portfolio";
  (ctx.session as Record<string, unknown>).add_pf_step = "caption";
  await ctx.reply("Caption for the image?", {
    reply_markup: { force_reply: true, input_field_placeholder: "e.g. Beautiful balayage transformation" },
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.admin_action !== "add_portfolio") return next();

  const step = (ctx.session as Record<string, unknown>).add_pf_step as string;
  const text = ctx.message.text.trim();

  if (step === "caption") {
    (ctx.session as Record<string, unknown>).add_pf_caption = text;
    (ctx.session as Record<string, unknown>).add_pf_step = "tags";
    await ctx.reply("Tags (comma-separated)?", {
      reply_markup: { force_reply: true, input_field_placeholder: "e.g. hair, balayage, color" },
    });
  } else if (step === "tags") {
    const tags = text.split(",").map((t) => t.trim()).filter(Boolean);
    (ctx.session as Record<string, unknown>).add_pf_tags = tags;
    (ctx.session as Record<string, unknown>).add_pf_step = "services";
    await ctx.reply("Related service IDs (comma-separated, or 'none')?", {
      reply_markup: { force_reply: true, input_field_placeholder: "e.g. svc_hair, svc_color" },
    });
  } else if (step === "services") {
    const serviceLinks = text.toLowerCase() === "none" ? [] : text.split(",").map((s) => s.trim()).filter(Boolean);
    const newItem: PortfolioItem = {
      id: generateId("pf"),
      image_url: "https://example.com/placeholder.jpg", // Placeholder; admin uploads via Telegram
      caption: (ctx.session as Record<string, unknown>).add_pf_caption as string,
      tags: (ctx.session as Record<string, unknown>).add_pf_tags as string[],
      service_links: serviceLinks,
    };

    await portfolioStore.set(newItem);
    ctx.session.admin_action = "idle";

    await ctx.reply(`Portfolio item "${newItem.caption}" added!`, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to portfolio", "admin:portfolio")]]),
    });
  }
});

// --- Bookings View ---

composer.callbackQuery("admin:bookings", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const bookings = await bookingStore.list();
  if (bookings.length === 0) {
    await ctx.reply("No bookings yet.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to dashboard", "admin")]]),
    });
    return;
  }

  const recent = bookings.slice(-5).reverse();
  const lines = await Promise.all(
    recent.map(async (b) => {
      const svc = await serviceStore.get(b.service_id);
      return `${b.id}: ${b.client_name} — ${svc?.name ?? b.service_id} at ${b.datetime} (${b.status})`;
    }),
  );

  await ctx.reply(`Recent bookings (${bookings.length} total):\n\n${lines.join("\n")}`, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to dashboard", "admin")]]),
  });
});

// --- Reviews Moderation ---

composer.callbackQuery("admin:reviews", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const reviews = await reviewStore.list();
  const pending = reviews.filter((r) => !r.admin_reply);

  if (pending.length === 0) {
    await ctx.reply("No pending reviews to moderate.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to dashboard", "admin")]]),
    });
    return;
  }

  const rows = pending.slice(0, 5).map((r) => [
    inlineButton(`${"⭐".repeat(r.rating)} — ${r.text.slice(0, 20) || "No text"}`, `admin:rev:${r.id}`),
  ]);
  rows.push([inlineButton("⬅️ Back to dashboard", "admin")]);

  await ctx.reply(`Pending reviews (${pending.length}):`, { reply_markup: inlineKeyboard(rows) });
});

composer.callbackQuery(/^admin:rev:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const revId = ctx.match[1];
  const review = await reviewStore.get(revId);
  if (!review) {
    await ctx.reply("Review not found.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:reviews")]]) });
    return;
  }

  const stars = "⭐".repeat(review.rating);
  await ctx.reply(
    `${stars}\n"${review.text || "No text"}"\n\nPhotos: ${review.photo_urls.length}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("💬 Reply", `admin:reply:${review.id}`)],
        [inlineButton("🗑 Delete", `admin:del_rev:${review.id}`)],
        [inlineButton("⬅️ Back to reviews", "admin:reviews")],
      ]),
    },
  );
});

composer.callbackQuery(/^admin:reply:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const revId = ctx.match[1];
  (ctx.session as Record<string, unknown>).reply_to_review = revId;
  ctx.session.admin_action = "idle";

  await ctx.reply("Type your reply to this review:", {
    reply_markup: { force_reply: true, input_field_placeholder: "Your reply…" },
  });
});

composer.on("message:text", async (ctx, next) => {
  const replyTo = (ctx.session as Record<string, unknown>).reply_to_review as string;
  if (!replyTo) return next();

  const review = await reviewStore.get(replyTo);
  if (!review) {
    await ctx.reply("Review no longer exists.");
    (ctx.session as Record<string, unknown>).reply_to_review = undefined;
    return;
  }

  review.admin_reply = ctx.message.text.trim();
  await reviewStore.set(review);
  (ctx.session as Record<string, unknown>).reply_to_review = undefined;

  await ctx.reply("Reply saved!", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to reviews", "admin:reviews")]]),
  });
});

composer.callbackQuery(/^admin:del_rev:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  const revId = ctx.match[1];
  await reviewStore.delete(revId);

  await ctx.editMessageText("Review deleted.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to reviews", "admin:reviews")]]),
  });
});

// --- Add Admin ---

composer.callbackQuery("admin:add_admin", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await isAdmin(ctx.from.id)) return;

  await ctx.reply(
    "To add a new admin, ask them to message this bot first, then share their Telegram user ID with you.\n\n" +
    "⚠️ For security, new admins must be added by the bot owner directly.",
  );
});

export default composer;
