import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Db, dataFilePath, type DbState } from "../src/store/db.js";

/**
 * Storage health gate (production requirement): the social backend must
 * never silently absorb a failing or corrupt persistence layer — corrupt
 * state fails the boot loud, a failing disk degrades loudly (no throw,
 * honest /health status), and recovery turns the probe green again.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sunbird-db-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function stateWithProfile(): DbState {
  const s = new Db().state;
  (s.profiles as Record<string, unknown>)["p1"] = {
    id: "p1",
    name: "Test Pilot",
    createdAt: 1,
    lastSeenAt: 1,
    settings: {},
    coins: 10,
  };
  return s;
}

describe("Db storage health gate", () => {
  it("first boot with no state file starts clean and reports file mode", () => {
    const db = new Db(undefined, join(dir, "state.json"));
    expect(db.storageStatus()).toEqual({ mode: "file", ok: true, detail: null });
    expect(db.state.profiles).toEqual({});
  });

  it("memory mode (no file) is reported honestly and never throws", () => {
    const db = new Db();
    expect(db.storageStatus()).toEqual({ mode: "memory", ok: true, detail: null });
    db.touch(); // no-op without a file
    db.flush(); // no-op without a file
    expect(db.storageStatus().ok).toBe(true);
  });

  it("flush() writes a parseable state file and survives a restart", () => {
    const file = join(dir, "state.json");
    const db = new Db(undefined, file);
    db.state = stateWithProfile();
    db.touch();
    db.flush();
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    expect(Object.keys(parsed.profiles)).toEqual(["p1"]);
    // Restart from disk: the profile is intact.
    const reloaded = new Db(undefined, file);
    expect(Object.keys(reloaded.state.profiles)).toEqual(["p1"]);
    expect(reloaded.storageStatus()).toEqual({ mode: "file", ok: true, detail: null });
  });

  it("a corrupt state file refuses to boot (no silent empty database)", () => {
    const file = join(dir, "state.json");
    writeFileSync(file, "{ this is not json");
    expect(() => new Db(undefined, file)).toThrowError(/corrupt state file/);
  });

  // Running as root bypasses file permissions, so the EACCES simulation
  // would pass vacuously — skip the test there instead of lying.
  const itUnread =
    typeof process.getuid === "function" && process.getuid() === 0 ? it.skip : it;

  itUnread("an unreadable existing state file refuses to boot", () => {
    const file = join(dir, "state.json");
    writeFileSync(file, "exists but unreadable");
    chmodSync(file, 0o000);
    try {
      expect(() => new Db(undefined, file)).toThrowError(/cannot read state file/);
    } finally {
      chmodSync(file, 0o644); // let afterEach clean up
    }
  });

  it("a failing disk degrades loudly without throwing (ENOTDIR volume)", () => {
    // The parent path is a regular FILE, so mkdirSync(recursive) fails with
    // ENOTDIR — the same error class a full/broken volume produces.
    const dirFile = join(dir, "vol");
    writeFileSync(dirFile, "x");
    const db = new Db(undefined, join(dirFile, "state.json"));
    expect(db.storageStatus().ok).toBe(true);

    db.state = stateWithProfile();
    db.touch();
    db.flush(); // must NOT throw — in production the failure lands in a timer
    const degraded = db.storageStatus();
    expect(degraded.mode).toBe("file");
    expect(degraded.ok).toBe(false);
    expect(degraded.detail).toBeTruthy();

    // The state stays dirty (retried on the next attempt) and close()
    // reports the pending failure instead of exiting silently.
    db.close();
    expect(db.storageStatus().ok).toBe(false);
  });

  it("recovery from a degraded disk turns the probe green again", () => {
    const slot = join(dir, "vol"); // a FILE — every write below it fails (ENOTDIR)
    writeFileSync(slot, "x");
    const file = dataFilePath(join(dir, "vol"));
    const db = new Db(undefined, file);
    db.state = stateWithProfile();
    db.touch();
    db.flush(); // must not throw
    expect(db.storageStatus().ok).toBe(false);

    // "Repair the volume": swap the file for a real directory. The state
    // was kept dirty by the failed flush, so one more flush recovers it.
    rmSync(slot);
    mkdirSync(slot);
    db.touch();
    db.flush();
    expect(db.storageStatus()).toEqual({ mode: "file", ok: true, detail: null });

    // The retried write persisted the in-RAM state that had been at risk.
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    expect(Object.keys(parsed.profiles)).toEqual(["p1"]);
  });
});
