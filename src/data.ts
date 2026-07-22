import { MemorySessionStorage } from "./toolkit/session/memory.js";
import { DurableStore } from "./store.js";
import type { Service, Booking, PortfolioItem, Review, AdminUser } from "./data-types.js";

/**
 * Shared data stores for the GlowEr Beauty Bot.
 * Uses in-memory storage for dev/test. Production should use Redis-backed storage.
 * Each store is a DurableStore backed by its own MemorySessionStorage instance.
 */

// Index keys (unique per entity type to avoid collisions)
const INDEX_KEYS = {
  services: "__idx_services",
  bookings: "__idx_bookings",
  portfolio: "__idx_portfolio",
  reviews: "__idx_reviews",
  admins: "__idx_admins",
};

// Create stores (one per entity type)
export const serviceStore = new DurableStore<Service>(
  new MemorySessionStorage<Service>(),
  INDEX_KEYS.services,
);

export const bookingStore = new DurableStore<Booking>(
  new MemorySessionStorage<Booking>(),
  INDEX_KEYS.bookings,
);

export const portfolioStore = new DurableStore<PortfolioItem>(
  new MemorySessionStorage<PortfolioItem>(),
  INDEX_KEYS.portfolio,
);

export const reviewStore = new DurableStore<Review>(
  new MemorySessionStorage<Review>(),
  INDEX_KEYS.reviews,
);

export const adminStore = new DurableStore<AdminUser>(
  new MemorySessionStorage<AdminUser>(),
  INDEX_KEYS.admins,
);

/**
 * Seed default service categories if the store is empty.
 * Called once at startup.
 */
export async function seedDefaultServices(): Promise<void> {
  const count = await serviceStore.count();
  if (count > 0) return;

  const defaults: Service[] = [
    {
      id: "svc_haircut",
      name: "Haircut",
      category: "Hair",
      duration: 30,
      price: 45,
      description: "Classic haircut with wash and style.",
      slots: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
    },
    {
      id: "svc_hair_color",
      name: "Hair Coloring",
      category: "Hair",
      duration: 90,
      price: 120,
      description: "Full color treatment with premium products.",
      slots: ["09:00", "11:00", "14:00"],
    },
    {
      id: "svc_facial",
      name: "Classic Facial",
      category: "Skin",
      duration: 45,
      price: 65,
      description: "Deep cleansing facial for refreshed skin.",
      slots: ["10:00", "11:00", "14:00", "15:00"],
    },
    {
      id: "svc_manicure",
      name: "Manicure",
      category: "Nails",
      duration: 30,
      price: 35,
      description: "Classic manicure with polish.",
      slots: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
    },
    {
      id: "svc_pedicure",
      name: "Pedicure",
      category: "Nails",
      duration: 45,
      price: 50,
      description: "Relaxing pedicure with massage.",
      slots: ["10:00", "11:00", "14:00", "15:00"],
    },
  ];

  for (const svc of defaults) {
    await serviceStore.set(svc);
  }
}
