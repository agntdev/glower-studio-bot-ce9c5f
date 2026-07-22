/**
 * GlowEr Beauty Bot — data entities.
 * All entities have an `id` field for the DurableStore pattern.
 * Durability: persistent (survives restarts via Redis-backed storage).
 */

export interface Service {
  id: string;
  name: string;
  category: string;
  duration: number; // minutes
  price: number;
  description: string;
  slots: string[]; // available time slots, e.g. ["09:00", "10:00", "14:00"]
}

export interface Booking {
  id: string;
  client_name: string;
  user_id: number;
  service_id: string;
  datetime: string; // ISO string or "YYYY-MM-DD HH:mm"
  status: "pending" | "confirmed" | "completed" | "cancelled";
  notes: string;
}

export interface PortfolioItem {
  id: string;
  image_url: string;
  caption: string;
  tags: string[];
  service_links: string[]; // service IDs this portfolio item relates to
}

export interface Review {
  id: string;
  user_id: number;
  rating: number; // 1-5
  text: string;
  photo_urls: string[];
  timestamp: string; // ISO string
  admin_reply: string;
}

export interface AdminUser {
  id: string;
  telegram_id: number;
  permissions: string[];
}
