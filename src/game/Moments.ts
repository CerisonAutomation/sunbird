/**
 * Moments — the single classification layer between physics and feeling.
 *
 * Every memorable beat of a flight (a BONK on a ridge, a SPLOSH into the
 * ocean, a BOING off a sunflower) already had sound, particles and a quip
 * scattered across `Game.ts`. What it never had was *one place* that knew:
 *
 *   1. what kind of moment this was,
 *   2. how it should sound, shake, buzz and read,
 *   3. how many of them this flight contained,
 *   4. what the results card should say about it, and
 *   5. what the player should do next because of it.
 *
 * This module is that place. It is deliberately dependency-free (no DOM, no
 * three.js, no SaveData) so it can be unit-tested and imported from anywhere
 * without cycles — the same rule `Economy.ts` follows.
 *
 * Pipeline contract:
 *
 *     physics event  →  MomentKind            (caller classifies, once)
 *     MomentKind     →  MOMENTS[kind]         (reaction bundle: copy/tone/haptic)
 *     reaction       →  MomentLedger.record() (per-run tally + session firsts)
 *     tally          →  momentChips/headline  (results-card language)
 *     dominant kind  →  momentNextAction()    (the CTA that follows the joke)
 *     firsts         →  telemetry             (retention funnel: first laugh)
 *
 * The caller (Game.ts `fireMoment`) performs the actual sound/popup/haptics
 * because those need live scene context; everything it needs to do so lives in
 * the `MomentDef` returned here, so no copy or timing constants leak back into
 * the game loop.
 */

/** The nine moments the game is built to produce. */
export const MOMENT_KINDS = [
  "bonk",
  "splash",
  "boing",
  "phew",
  "perfect",
  "panic",
  "sleep",
  "record",
  // Appended last on purpose: the ledger's tie order and the results-card chip
  // order both follow this list, so inserting a kind would silently rewrite the
  // story of every run already recorded.
  "wee",
] as const;

export type MomentKind = (typeof MOMENT_KINDS)[number];

/** Popup visual styles the HUD already knows how to draw. */
export type MomentPopup = "perfect" | "great" | "thud" | "bop" | "fever" | "zenith" | "splash" | "power";

export type MomentDef = {
  kind: MomentKind;
  /** Emoji used in popups, chips and share text. */
  icon: string;
  /** English label — also the i18n fallback. */
  label: string;
  /** Translation key for `label` (see `src/i18n/translations.barrel.json`). */
  key: string;
  /** Translation key for the results-card line (takes `{{n}}`). */
  cardKey: string;
  /** HUD popup style. */
  popup: MomentPopup;
  /** Toast tone. */
  tone: string;
  /** Vibration pattern in ms — a single buzz or an alternating rhythm. */
  haptic: number | number[];
  /** The on-screen word the moment shouts. Kept short: popups are tiny. */
  shout: string;
  /**
   * Results-card line for `n` occurrences. This is the English fallback for
   * `cardKey`; the barrel string wins in every shipped locale, so the two are
   * kept word-for-word identical to avoid drift.
   */
  cardLine: (n: number) => string;
  /**
   * What to do next, given this was the run's dominant moment. The action id
   * matches a HUD `data-action` so the card can deep-link instead of lecturing.
   */
  next: { title: string; tip: string; action?: string };
};

/**
 * The reaction table. One entry per kind; nothing else in the codebase is
 * allowed to invent moment copy, so a joke can be rewritten in one place and
 * propagates to popups, results cards, share text and telemetry alike.
 */
export const MOMENTS: Record<MomentKind, MomentDef> = {
  bonk: {
    kind: "bonk",
    icon: "\u{1F4A5}",
    label: "BONK",
    key: "moments.bonk",
    cardKey: "moments.bonk.card",
    popup: "thud",
    tone: "warn",
    haptic: [18, 12, 26],
    shout: "BONK!",
    cardLine: (n) => `${n} BONK \u2014 the hills are keeping score`,
    next: {
      title: "Arm a shield before the next ridge",
      tip: "A Shield Flute eats one BONK per flight, so a hard landing stops costing you the run.",
      action: "open-shop",
    },
  },
  splash: {
    kind: "splash",
    icon: "\u{1F4A6}",
    label: "SPLOSH",
    key: "moments.splash",
    cardKey: "moments.splash.card",
    popup: "splash",
    tone: "cloud",
    haptic: [12, 20, 12],
    shout: "SPLOSH!",
    cardLine: (n) => `${n} SPLOSH \u2014 the ocean says hi`,
    next: {
      title: "Stay airborne over the gaps",
      tip: "Water kills daylight fast. Launch earlier on the downhill and you will clear the channel.",
      action: "open-shop",
    },
  },
  boing: {
    kind: "boing",
    icon: "\u{1F33B}",
    label: "BOING",
    key: "moments.boing",
    cardKey: "moments.boing.card",
    popup: "bop",
    tone: "gold",
    haptic: [20, 10, 40],
    shout: "BOING!",
    cardLine: (n) => `${n} BOING \u2014 gravity complained, flowers cheered, you soared!`,
    next: {
      title: "Aim at the flowers on purpose — you're a natural!",
      tip: "Every sunflower is a launch pad worth +80. Chain two in a row and Fever is one hop away. You make it look easy!",
    },
  },
  phew: {
    kind: "phew",
    icon: "\u{1F62E}\u200D\u{1F4A8}",
    label: "PHEW",
    key: "moments.phew",
    cardKey: "moments.phew.card",
    popup: "great",
    tone: "power",
    haptic: 10,
    shout: "PHEW!",
    cardLine: (n) => `${n} PHEW \u2014 that close you could high-five the mountain! Legendary save!`,
    next: {
      title: "Hug the ridge for skim points — you love danger!",
      tip: "Flying low and fast over a ridge pays +15 each time. Danger is literally a scoring mechanic. And you eat danger for breakfast!",
    },
  },
  perfect: {
    kind: "perfect",
    icon: "\u2728",
    label: "PERFECT",
    key: "moments.perfect",
    cardKey: "moments.perfect.card",
    popup: "perfect",
    tone: "zenith",
    haptic: [8, 6, 8],
    shout: "PERFECT!",
    cardLine: (n) => `${n} PERFECT \u2014 pure butter, chef's kiss, 11/10, would fly again!`,
    next: {
      title: "Stack them into a Fever chain — you're on fire!",
      tip: "Perfect take-offs chain. Enough in a row lights Fever, and Fever is where the big distances live. You're already halfway there, legend!",
      action: "open-shop",
    },
  },
  panic: {
    kind: "panic",
    icon: "\u{1F631}",
    label: "PANIC",
    key: "moments.panic",
    cardKey: "moments.panic.card",
    popup: "zenith",
    tone: "warn",
    haptic: [6, 4, 6, 4, 20],
    shout: "PANIC!",
    cardLine: (n) => `${n} PANIC \u2014 flapping for dear life`,
    next: {
      title: "Buy Tailwind Launch",
      tip: "A speed burst the instant you leave the ground, so a slow start can never turn into a stall.",
      action: "open-shop",
    },
  },
  sleep: {
    kind: "sleep",
    icon: "\u{1F4A4}",
    label: "SLEEP",
    key: "moments.sleep",
    cardKey: "moments.sleep.card",
    popup: "thud",
    tone: "cloud",
    haptic: [30, 40, 30],
    shout: "zzz",
    cardLine: (n) => `${n} SLEEP \u2014 the sun won`,
    next: {
      title: "Chase daylight, not distance",
      tip: "Coins, rings and perfect take-offs all push the sunset back. Grab them early and the flight lasts.",
    },
  },
  record: {
    kind: "record",
    icon: "\u{1F451}",
    label: "RECORD",
    key: "moments.record",
    cardKey: "moments.record.card",
    popup: "fever",
    tone: "gold",
    haptic: [40, 30, 60],
    shout: "RECORD!",
    cardLine: (n) => `${n} RECORD \u2014 your old best retired`,
    next: {
      title: "Make someone else chase it",
      tip: "Share the run and a rival gets your exact hills as a ghost. Records are only fun with witnesses.",
      action: "share",
    },
  },
  /**
   * WEE — the pure-joy beat, and the only moment the *speed itself* fires.
   * Everything else in this table is a collision with the world; this one is
   * the world falling away. Triggered by SpeedFeel.weeCheck (warp speed while
   * diving, hysteresis-gated) so it stays rare enough to be a treat.
   */
  wee: {
    kind: "wee",
    icon: "\u{1F4A8}",
    label: "WEE",
    key: "moments.wee",
    cardKey: "moments.wee.card",
    popup: "fever",
    tone: "zenith",
    haptic: [6, 4, 12],
    shout: "WEE!",
    cardLine: (n) => `${n} WEE \u2014 the sky was too slow`,
    next: {
      title: "Find that line again on purpose",
      tip: "WEE only fires at warp speed mid-dive. Steeper slopes and a longer tuck keep the fast line coming back.",
    },
  },
};

/** One row of a results-card tally. */
export type MomentTally = {
  kind: MomentKind;
  icon: string;
  label: string;
  /** Translation key for `label`. */
  key: string;
  count: number;
};

/**
 * Per-run moment bookkeeping.
 *
 * Cheap by construction: a handful of counters touched a few times a flight at
 * most, so it can be called from inside the physics step without anyone
 * noticing. It also remembers which kinds have fired *this session* so the
 * retention funnel can report "first funny moment" exactly once.
 */
export class MomentLedger {
  private counts: Record<MomentKind, number> = {
    bonk: 0,
    splash: 0,
    boing: 0,
    phew: 0,
    perfect: 0,
    panic: 0,
    sleep: 0,
    record: 0,
    wee: 0,
  };
  /** Insertion order, so ties on the card read as "the run's story". */
  private order: MomentKind[] = [];
  private seenEver = new Set<MomentKind>();
  private total = 0;

  /** Records one occurrence. @returns the new count for that kind. */
  record(kind: MomentKind): number {
    const before = this.counts[kind];
    this.counts[kind] = before + 1;
    if (before === 0) this.order.push(kind);
    this.total += 1;
    return this.counts[kind];
  }

  count(kind: MomentKind): number {
    return this.counts[kind];
  }

  /** Total moments this run, of every kind. */
  get length(): number {
    return this.total;
  }

  /** True the first time this kind fires in the session (funnel signal). */
  isFirstEver(kind: MomentKind): boolean {
    if (this.seenEver.has(kind)) return false;
    this.seenEver.add(kind);
    return true;
  }

  /** Clears the run tally but keeps session-long "seen" memory. */
  resetRun(): void {
    for (const kind of MOMENT_KINDS) this.counts[kind] = 0;
    this.order = [];
    this.total = 0;
  }

  /** Clears everything — used when a brand new session starts. */
  resetAll(): void {
    this.resetRun();
    this.seenEver.clear();
  }

  /**
   * The run's moments as card rows: most frequent first, ties broken by which
   * happened first (chronology reads better than alphabet on a recap).
   * @param max rows to return (0 = all).
   */
  tally(max = 4): MomentTally[] {
    const def = MOMENTS;
    const rows = this.order
      .filter((kind) => this.counts[kind] > 0)
      .map((kind, i) => ({ kind, i, def: def[kind] }))
      .sort((a, b) => this.counts[b.kind] - this.counts[a.kind] || a.i - b.i)
      .map(({ kind, def: d }) => ({ kind, icon: d.icon, label: d.label, key: d.key, count: this.counts[kind] }));
    return max > 0 ? rows.slice(0, max) : rows;
  }

  /** The run's dominant moment — the one the card headline tells the story of. */
  headline(): MomentKind | null {
    const rows = this.tally(1);
    return rows.length ? rows[0].kind : null;
  }

  /** Flat `{ kind: count }` for telemetry (only kinds that actually fired). */
  toJSON(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const kind of MOMENT_KINDS) if (this.counts[kind] > 0) out[kind] = this.counts[kind];
    return out;
  }

  /**
   * One line of share/recap text: the dominant moment plus the total, e.g.
   * `"4 BONKs and 1 RECORD"`. Empty string when the flight was uneventful, so
   * callers can skip the strip entirely instead of printing "0 BONKs".
   */
  recapLine(): string {
    const rows = this.tally(3);
    if (!rows.length) return "";
    return rows.map((r) => `${r.count} ${MOMENTS[r.kind].label}`).join(" \u00b7 ");
  }
}

/**
 * The next-action CTA that follows the run's dominant moment.
 *
 * The results card already has a "take this into your next flight" lesson; this
 * is the *moment* version of the same idea, and it wins whenever the flight had
 * a clear personality (a run full of BONKs should sell a shield, not a tip).
 */
export function momentNextAction(ledger: MomentLedger): MomentDef["next"] | null {
  const kind = ledger.headline();
  return kind ? MOMENTS[kind].next : null;
}

/**
 * How long a kind must stay quiet before it may react again, given how many
 * times it has already fired this run.
 *
 * Some moments arrive in bursts — a bird sliding along a beach stalls every
 * frame, an ocean crossing splashes every half second. Without a shared budget
 * each kind would need its own hand-tuned cooldown, and the results card would
 * report "PANIC ×412" for one bad beach. The first few always land (a moment
 * that never shows is not a moment), then the cadence slows so a chaotic
 * flight stays readable and the phone stops buzzing like a trapped bee.
 */
export function momentRepeatGap(count: number): number {
  if (count <= 2) return 0.3;
  if (count <= 6) return 0.9;
  if (count <= 14) return 2.2;
  return 5;
}

/**
 * Whether a kind may react now. @param count occurrences already *shown* this
 * run, @param secondsSinceLast time since this kind last reacted.
 */
export function momentShouldReact(count: number, secondsSinceLast: number): boolean {
  return secondsSinceLast >= momentRepeatGap(count);
}
