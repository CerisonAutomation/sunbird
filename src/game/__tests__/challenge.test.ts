import { describe, expect, it } from "vitest";

/**
 * The rival-link payload is `seed.distance.encodedName` inside
 * `#rival=...`. These mirror-tests lock the codec's grammar so a format
 * drift can't silently orphan every previously shared link.
 */
const encode = (seed: string, distance: number, name: string): string =>
  `${seed}.${Math.floor(distance)}.${encodeURIComponent(name)}`;

const decode = (raw: string): { seed: string; distance: number; name: string } | null => {
  const [seed, dist, ...nameParts] = raw.split(".");
  const distance = Math.floor(Number(dist));
  if (!seed || !/^[a-z0-9-]{1,40}$/i.test(seed)) return null;
  if (!Number.isFinite(distance) || distance <= 0 || distance > 1_000_000) return null;
  const name = decodeURIComponent(nameParts.join(".")).replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 14) || "A rival";
  return { seed, distance, name };
};

describe("rival challenge links", () => {
  it("round-trips a normal challenge", () => {
    const raw = encode("2026-09-11", 3121, "Pilot 7Q2F");
    const c = decode(raw)!;
    expect(c.seed).toBe("2026-09-11");
    expect(c.distance).toBe(3121);
    expect(c.name).toBe("Pilot 7Q2F");
  });

  it("survives names containing dots (the payload separator)", () => {
    const raw = encode("wild-abc123", 500, "j.r. hawk");
    const c = decode(raw)!;
    expect(c.name).toBe("j.r. hawk");
    expect(c.distance).toBe(500);
  });

  it("rejects malformed and hostile payloads", () => {
    expect(decode("..")).toBeNull(); // empty seed
    expect(decode("seed$bad.100.x")).toBeNull(); // seed charset
    expect(decode("ok.-5.x")).toBeNull(); // negative distance
    expect(decode("ok.NaN.x")).toBeNull(); // non-numeric distance
    expect(decode("ok.99999999.x")).toBeNull(); // absurd distance
  });

  it("sanitizes script-y names instead of rejecting the challenge", () => {
    const c = decode(encode("2026-09-11", 100, "<img onerror=x>"))!;
    expect(c.name).not.toContain("<");
    expect(c.name).not.toContain(">");
  });
});
