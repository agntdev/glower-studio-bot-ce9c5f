import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { serviceStore, bookingStore, seedDefaultServices } from "../data.js";

// Register the Book Service button in the main menu
registerMainMenuItem({ label: "📅 Book Service", data: "booking:start", order: 10 });

const composer = new Composer<Ctx>();

// Helper: generate a unique booking ID
function generateBookingId(): string {
  return "BK-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Entry point: show service categories
composer.callbackQuery("booking:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.booking_step = "category";

  // Ensure default services exist
  await seedDefaultServices();

  const services = await serviceStore.list();
  const categories = [...new Set(services.map((s) => s.category))].sort();

  if (categories.length === 0) {
    await ctx.reply("No services available right now. Check back soon!", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const rows = categories.map((cat) => [inlineButton(cat, `booking:cat:${cat}`)]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.reply("Which category interests you?", {
    reply_markup: inlineKeyboard(rows),
  });
});

// Step 1: Show services in a category
composer.callbackQuery(/^booking:cat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const category = ctx.match[1];
  ctx.session.booking_category = category;
  ctx.session.booking_step = "service";

  const services = await serviceStore.list();
  const filtered = services.filter((s) => s.category === category);

  if (filtered.length === 0) {
    await ctx.reply(`No services in ${category} yet.`, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to categories", "booking:start")]]),
    });
    return;
  }

  const rows = filtered.map((svc) => [inlineButton(`${svc.name} — $${svc.price}`, `booking:svc:${svc.id}`)]);
  rows.push([inlineButton("⬅️ Back to categories", "booking:start")]);

  await ctx.reply(`${category} services:`, {
    reply_markup: inlineKeyboard(rows),
  });
});

// Step 2: Show service details and available slots
composer.callbackQuery(/^booking:svc:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const serviceId = ctx.match[1];
  ctx.session.booking_service_id = serviceId;
  ctx.session.booking_step = "slot";

  const service = await serviceStore.get(serviceId);
  if (!service) {
    await ctx.reply("Sorry, that service isn't available anymore.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  if (service.slots.length === 0) {
    await ctx.reply(`No time slots available for ${service.name} today.`, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const rows = service.slots.map((slot) => [inlineButton(slot, `booking:slot:${slot}`)]);
  rows.push([inlineButton("⬅️ Back to services", `booking:cat:${service.category}`)]);

  await ctx.reply(`${service.name} — ${service.duration} min, $${service.price}\n\nPick a time slot:`, {
    reply_markup: inlineKeyboard(rows),
  });
});

// Step 3: Show selected slot and ask for client name
composer.callbackQuery(/^booking:slot:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const slot = ctx.match[1];
  ctx.session.booking_slot = slot;
  ctx.session.booking_step = "confirm";

  const service = await serviceStore.get(ctx.session.booking_service_id!);

  await ctx.reply(
    `Great choice!\n\n` +
      `Service: ${service?.name}\n` +
      `Time: ${slot}\n` +
      `Duration: ${service?.duration} min\n` +
      `Price: $${service?.price}\n\n` +
      `What's your name?`,
    {
      reply_markup: { force_reply: true, input_field_placeholder: "Type your name…" },
    },
  );
});

// Step 4: Collect name and ask for phone
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.booking_step !== "confirm") return next();
  if (ctx.session.booking_client_name) {
    // Already have name, this must be phone
    ctx.session.booking_client_phone = ctx.message.text.trim();
    ctx.session.booking_step = "idle";

    const service = await serviceStore.get(ctx.session.booking_service_id!);
    const bookingId = generateBookingId();

    // Create the booking
    await bookingStore.set({
      id: bookingId,
      client_name: ctx.session.booking_client_name,
      user_id: ctx.from.id,
      service_id: ctx.session.booking_service_id!,
      datetime: ctx.session.booking_slot!,
      status: "confirmed",
      notes: `Phone: ${ctx.session.booking_client_phone}`,
    });

    // Clear booking session state
    ctx.session.booking_step = undefined;
    ctx.session.booking_category = undefined;
    ctx.session.booking_service_id = undefined;
    ctx.session.booking_slot = undefined;
    ctx.session.booking_client_name = undefined;
    ctx.session.booking_client_phone = undefined;

    await ctx.reply(
      `Booking confirmed!\n\n` +
        `Service: ${service?.name}\n` +
        `Time: ${ctx.session.booking_slot}\n` +
        `Booking ID: ${bookingId}\n\n` +
        `We'll see you soon! Tap below to book another or go back to the menu.`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📅 Book another", "booking:start")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  // First message in confirm step = name
  ctx.session.booking_client_name = ctx.message.text.trim();
  await ctx.reply("Got it! What's your phone number?", {
    reply_markup: { force_reply: true, input_field_placeholder: "Type your phone number…" },
  });
});

// Cancel booking flow
composer.callbackQuery("booking:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.booking_step = "idle";
  ctx.session.booking_category = undefined;
  ctx.session.booking_service_id = undefined;
  ctx.session.booking_slot = undefined;
  ctx.session.booking_client_name = undefined;
  ctx.session.booking_client_phone = undefined;

  await ctx.editMessageText("Booking cancelled. Tap /start to begin again.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
