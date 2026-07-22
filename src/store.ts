import { MemorySessionStorage } from "./toolkit/session/memory.js";
import type { StorageAdapter } from "grammy";

/**
 * DurableStore — a typed key-value store for durable domain data.
 *
 * Uses a StorageAdapter internally (Redis in production, in-memory for dev/test).
 * Each entity type gets its own store instance with a unique prefix to avoid
 * key collisions across entity types.
 *
 * Pattern: store.get(id) returns T | undefined, store.set(id, value) persists,
 * store.delete(id) removes, store.list() returns all values.
 */
export class DurableStore<T extends { id: string }> {
  private adapter: StorageAdapter<T>;
  private indexKey: string;

  constructor(adapter: StorageAdapter<T>, indexKey: string) {
    this.adapter = adapter;
    this.indexKey = indexKey;
  }

  async get(id: string): Promise<T | undefined> {
    return this.adapter.read(id);
  }

  async set(item: T): Promise<void> {
    await this.adapter.write(item.id, item);
    await this.addToIndex(item.id);
  }

  async delete(id: string): Promise<boolean> {
    const existed = (await this.adapter.read(id)) !== undefined;
    if (existed) {
      await this.adapter.delete(id);
      await this.removeFromIndex(id);
    }
    return existed;
  }

  async list(): Promise<T[]> {
    const index = await this.readIndex();
    const items: T[] = [];
    for (const id of index) {
      const item = await this.adapter.read(id);
      if (item) items.push(item);
    }
    return items;
  }

  async count(): Promise<number> {
    const index = await this.readIndex();
    return index.length;
  }

  private async readIndex(): Promise<string[]> {
    const raw = await this.adapter.read(this.indexKey);
    if (!raw || typeof raw !== "object" || !("ids" in raw)) return [];
    return (raw as unknown as { ids: string[] }).ids;
  }

  private async writeIndex(ids: string[]): Promise<void> {
    await this.adapter.write(this.indexKey, { id: this.indexKey, ids } as unknown as T);
  }

  private async addToIndex(id: string): Promise<void> {
    const index = await this.readIndex();
    if (!index.includes(id)) {
      index.push(id);
      await this.writeIndex(index);
    }
  }

  private async removeFromIndex(id: string): Promise<void> {
    const index = await this.readIndex();
    const filtered = index.filter((i) => i !== id);
    await this.writeIndex(filtered);
  }
}

/**
 * Create a store backed by the given StorageAdapter.
 * For production, pass a Redis-backed adapter.
 * For dev/test, pass a MemorySessionStorage instance.
 */
export function createStore<T extends { id: string }>(
  adapter: StorageAdapter<T>,
  indexKey: string,
): DurableStore<T> {
  return new DurableStore<T>(adapter, indexKey);
}

/**
 * Create an in-memory store (for dev/test only).
 * Production bots should use Redis-backed storage.
 */
export function createMemoryStore<T extends { id: string }>(indexKey: string): DurableStore<T> {
  return new DurableStore<T>(new MemorySessionStorage<T>(), indexKey);
}
