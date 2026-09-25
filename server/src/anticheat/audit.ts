/**
 * Append-only audit trail. Every moderation action, quarantine, reward
 * issuance, and suspension is logged — to an in-memory ring (for the review
 * UI) and, when a data dir is configured, to `audit.jsonl` (for operators).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { AuditEntry } from "../types.js";

const RING_SIZE = 1000;

export class AuditLog {
  private ring: AuditEntry[] = [];
  private file: string | null;

  constructor(dataDir: string | null) {
    this.file = dataDir ? join(dataDir, "audit.jsonl") : null;
    if (this.file) mkdirSync(dirname(this.file), { recursive: true });
  }

  log(actor: string, action: string, target: string, meta?: Record<string, unknown>): void {
    const entry: AuditEntry = { at: new Date().toISOString(), actor, action, target, meta };
    this.ring.push(entry);
    if (this.ring.length > RING_SIZE) this.ring.shift();
    if (this.file) {
      try {
        appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
      } catch {
        /* audit must never take the server down */
      }
    }
  }

  tail(n = 100): AuditEntry[] {
    return this.ring.slice(-n);
  }

  forTarget(target: string): AuditEntry[] {
    return this.ring.filter((e) => e.target === target);
  }
}
