import { describe, expect, it } from "vitest";
import { generatePilotName, isPilotNameClean, moderatePilotName } from "../pilotNameGenerator";
import { normalizePilotName, squashPilotName } from "../pilotNameModeration";

/**
 * The pilot name is the one surface where a player authors text that other real
 * people then read: it is broadcast over netlib (rosters, in-world name tags,
 * squad) and persisted on a public leaderboard. Poki's policy forbids chat
 * systems and personal-data collection but does not forbid a chosen display
 * name, so the filter below is what stands between a typed name and a public,
 * permanent surface that also has to clear the platform's moderation check.
 *
 * These tests are the two failure modes that matter equally: a filter that can
 * be evaded with "f.u.c.k"/"fück"/"fυck", and a filter that blocks "Cockpit" or
 * "Classic" because they contain "cock" and "ass".
 */
describe("pilot-name moderation — evasions", () => {
  const evasions = [
    "fuck", "FUCK", "FuCk", "f.u.c.k", "f-u-c-k", "f u c k", "f_u_c_k",
    "fuuuck", "fuuuuuuck", "fück", "fυck", "fucκ", "phuck", "fuk", "fck",
    "sh1t", "sh!t", "shıt", "a$$hole", "a55hole", "asshole",
    "n1gger", "nıgger", "nigger", "n i g g e r",
    "b!tch", "b1tch", "cünt", "tw4t", "wh0re", "p0rn", "r4pe",
    "n4zi", "h1tler", "f4ggot", "faggot",
  ];

  it.each(evasions)("rejects %j", (name) => {
    expect(isPilotNameClean(name), `${name} must be rejected`).toBe(false);
  });

  it("collapses every one of those spellings to keys the blocklist can see", () => {
    // The normaliser is what makes the short blocklist sufficient: the point is
    // not that each evasion is enumerated, it is that they share a key.
    expect(squashPilotName(normalizePilotName("f.u.c.k"))).toBe("fuck");
    expect(squashPilotName(normalizePilotName("f u c k"))).toBe("fuck");
    expect(squashPilotName(normalizePilotName("fück"))).toBe("fuck");
    expect(squashPilotName(normalizePilotName("fυck"))).toBe("fuck");
    expect(squashPilotName(normalizePilotName("fuuuuck"))).toBe("fuck");
    expect(squashPilotName(normalizePilotName("sh1t"))).toBe("shit");
  });
});

describe("pilot-name moderation — the Scunthorpe problem", () => {
  // Every one of these contains a blocked substring. All are names a player
  // would legitimately want, and several are the game's own vocabulary.
  const legitimate = [
    "Cockpit", "Peacock", "Hancock", "Cockatoo", "Shuttlecock",
    "Classic", "Classy", "Bass", "Brass", "Compass", "Embassy", "Glass",
    "Grass", "Mass", "Passion", "Passive", "Password", "Harass",
    "Assassin", "Assess", "Asset", "Assign", "Assist", "Cassette",
    "Dickens", "Dickson", "Dickinson",
    "Altitude", "Latitude", "Attitude", "Gratitude", "Solitude",
    "Constitution", "Institution", "Substitute", "Methane", "Method",
    "Raccoon", "Tycoon", "Cocoon", "Crisp", "Prissy",
    "Kestrel", "Skimmer", "Plover", "Osprey", "Harrier", "Merlin",
    "Peregrine", "Phoenix", "SkyFalcon42", "StormOsprey77", "ApexNova10",
  ];

  it.each(legitimate)("allows %j", (name) => {
    expect(isPilotNameClean(name), `${name} must be allowed`).toBe(true);
  });
});

describe("pilot-name moderation — shape and contact details", () => {
  it("rejects names outside the 3..14 budget the UI enforces", () => {
    expect(isPilotNameClean("")).toBe(false);
    expect(isPilotNameClean("ab")).toBe(false);
    expect(isPilotNameClean("abcdefghijklmno")).toBe(false);
    expect(isPilotNameClean("SkyFox42")).toBe(true);
  });

  it("rejects names with no letters to read", () => {
    expect(isPilotNameClean("12345")).toBe(false);
    expect(isPilotNameClean("_._")).toBe(false);
  });

  it("rejects every way a name could be used to publish contact details", () => {
    // Poki forbids collecting personal information and external links; a public
    // leaderboard is exactly where a player would try to publish one.
    const contact = ["me@you", "skyfox@x", "www.foo", "http://x", "a.b.c", "call 0123456789"];
    for (const name of contact) {
      const verdict = moderatePilotName(name);
      expect(verdict.ok, `${name} must be rejected`).toBe(false);
      // "call 0123456789" is over the length budget, so it fails shape first —
      // either way it must not pass.
      if (!verdict.ok && name.length <= 14) {
        expect(verdict.reason, `${name} reason`).toBe("contact");
      }
    }
  });

  it("reports which stage failed, so the UI can say something useful", () => {
    expect(moderatePilotName("ab")).toEqual({ ok: false, reason: "shape" });
    expect(moderatePilotName("me@you")).toEqual({ ok: false, reason: "contact" });
    expect(moderatePilotName("fuck")).toEqual({ ok: false, reason: "language" });
    expect(moderatePilotName("SkyFox42")).toEqual({ ok: true });
  });
});

describe("pilot-name moderation — generated call signs always pass", () => {
  it("never trips the filter that gates typed names", () => {
    // The generator draws only from aviation/nature vocabulary, and the filter
    // must never reject the name the game itself hands a first-run player.
    for (let i = 0; i < 5000; i += 1) {
      const name = generatePilotName();
      expect(isPilotNameClean(name), `generated "${name}" was rejected`).toBe(true);
    }
  });
});
