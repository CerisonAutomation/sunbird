/**
 * File-backed object store for replay blobs, with per-owner and global
 * quotas plus LRU eviction. Falls back to an in-memory Map when no data
 * directory is configured (tests, previews).
 *
 * Replays are the only payload large enough to deserve their own store;
 * everything else lives in the JSON state document.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ObjectMeta = {
  key: string;
  ownerId: string;
  size: number;
  createdAt: number;
  lastAccess: number;
};

type MemoryEntry = { buf: Buffer; meta: ObjectMeta };

export class ObjectStore {
  private dir: string | null;
  private mem = new Map<string, MemoryEntry>();
  private metaIndex = new Map<string, ObjectMeta>();
  private totalBytes = 0;
  private perOwnerBytes = new Map<string, number>();

  constructor(
    dir: string | null,
    private readonly maxTotalBytes: number,
    private readonly maxPerOwnerBytes: number,
    private readonly maxPerOwnerCount: number,
    private readonly now: () => number = Date.now,
  ) {
    this.dir = dir ? join(dir, "replays") : null;
    if (this.dir) {
      mkdirSync(this.dir, { recursive: true });
      this.reindex();
    }
  }

  private reindex(): void {
    if (!this.dir) return;
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith(".obj")) continue;
      const key = name.slice(0, -4);
      try {
        const meta = statSync(join(this.dir, name));
        this.metaIndex.set(key, {
          key,
          ownerId: key.split(".")[0] ?? key.slice(0, 10),
          size: meta.size,
          createdAt: meta.mtimeMs,
          lastAccess: meta.atimeMs,
        });
        this.totalBytes += meta.size;
      } catch {
        /* partial file — ignore */
      }
    }
  }

  private pathOf(key: string): string | null {
    return this.dir ? join(this.dir, `${key}.obj`) : null;
  }

  async put(ownerId: string, key: string, bytes: Buffer): Promise<{ evicted: string[] }> {
    const evicted: string[] = [];
    const existing = await this.stat(key);
    if (existing) {
      this.totalBytes -= existing.size;
      this.decPerOwner(ownerId, existing.size);
    }
    // Per-owner count quota: evict oldest first.
    if (this.countFor(ownerId) >= this.maxPerOwnerCount && !existing) {
      const old = this.oldestFor(ownerId);
      if (!old) throw new Error("object store per-owner quota full");
      await this.delete(old);
      evicted.push(old);
    }
    if (this.bytesFor(ownerId) + bytes.length > this.maxPerOwnerBytes) {
      const need = this.bytesFor(ownerId) + bytes.length - this.maxPerOwnerBytes;
      const freedBy = await this.evictOwner(ownerId, need);
      if (freedBy.freed < need) throw new Error("object store per-owner byte quota full");
      evicted.push(...freedBy.keys);
    }
    if (this.totalBytes + bytes.length > this.maxTotalBytes) {
      const need = this.totalBytes + bytes.length - this.maxTotalBytes;
      const freed = await this.evictGlobal(need);
      if (freed < need) throw new Error("object store global byte quota full");
    }

    if (this.dir) {
      writeFileSync(this.pathOf(key)!, bytes);
    } else {
      this.mem.set(key, { buf: bytes, meta: { key, ownerId, size: bytes.length, createdAt: this.now(), lastAccess: this.now() } });
    }
    this.metaIndex.set(key, { key, ownerId, size: bytes.length, createdAt: this.now(), lastAccess: this.now() });
    this.totalBytes += bytes.length;
    this.perOwnerBytes.set(ownerId, this.bytesFor(ownerId) + bytes.length);
    return { evicted };
  }

  async get(key: string): Promise<Buffer | null> {
    const meta = this.metaIndex.get(key);
    if (!meta) return null;
    if (this.dir) {
      try {
        const buf = readFileSync(this.pathOf(key)!);
        meta.lastAccess = this.now();
        return buf;
      } catch {
        this.metaIndex.delete(key);
        return null;
      }
    }
    const entry = this.mem.get(key);
    if (!entry) return null;
    entry.meta.lastAccess = this.now();
    return entry.buf;
  }

  async stat(key: string): Promise<ObjectMeta | null> {
    return this.metaIndex.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    const meta = this.metaIndex.get(key);
    if (!meta) return;
    if (this.dir) {
      try {
        unlinkSync(this.pathOf(key)!);
      } catch {
        /* already gone */
      }
    }
    this.mem.delete(key);
    this.metaIndex.delete(key);
    this.totalBytes -= meta.size;
    this.decPerOwner(meta.ownerId, meta.size);
  }

  async list(ownerId?: string): Promise<ObjectMeta[]> {
    const all = [...this.metaIndex.values()];
    return ownerId ? all.filter((m) => m.ownerId === ownerId) : all;
  }

  /** Deterministic object key for a replay (owner-sharded). */
  static keyFor(ownerId: string, id: string): string {
    const shard = createHash("sha256").update(id).digest("hex").slice(0, 2);
    return `${ownerId.slice(0, 10)}.${shard}.${id}`;
  }

  totalBytesUsed(): number {
    return this.totalBytes;
  }

  /* ------------------------------------------------------------- internals */

  private bytesFor(ownerId: string): number {
    return this.perOwnerBytes.get(ownerId) ?? 0;
  }

  private decPerOwner(ownerId: string, n: number): void {
    const next = this.bytesFor(ownerId) - n;
    if (next <= 0) this.perOwnerBytes.delete(ownerId);
    else this.perOwnerBytes.set(ownerId, next);
  }

  private countFor(ownerId: string): number {
    let n = 0;
    for (const m of this.metaIndex.values()) if (m.ownerId === ownerId) n++;
    return n;
  }

  private oldestFor(ownerId: string): string | null {
    let oldest: ObjectMeta | null = null;
    for (const m of this.metaIndex.values()) {
      if (m.ownerId !== ownerId) continue;
      if (!oldest || m.createdAt < oldest.createdAt || (m.createdAt === oldest.createdAt && m.key < oldest.key)) oldest = m;
    }
    return oldest ? oldest.key : null;
  }

  private async evictOwner(ownerId: string, need: number): Promise<{ freed: number; keys: string[] }> {
    const keys: string[] = [];
    const victims = [...this.metaIndex.values()]
      .filter((m) => m.ownerId === ownerId)
      .sort((a, b) => a.lastAccess - b.lastAccess || a.key.localeCompare(b.key));
    let freed = 0;
    for (const v of victims) {
      if (freed >= need) break;
      await this.delete(v.key);
      freed += v.size;
      keys.push(v.key);
    }
    return { freed, keys };
  }

  private async evictGlobal(need: number): Promise<number> {
    const victims = [...this.metaIndex.values()].sort((a, b) => a.lastAccess - b.lastAccess || a.key.localeCompare(b.key));
    let freed = 0;
    for (const v of victims) {
      if (freed >= need) break;
      await this.delete(v.key);
      freed += v.size;
    }
    return freed;
  }
}
