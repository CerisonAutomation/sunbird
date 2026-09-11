/* Event System — Weekly rotating modes + monthly themed events + community challenges */

import { SeededRandom } from "./math";
import type { SaveData } from "./SaveData";

export type WeeklyModeModifier = {
  gravityMult: number; speedMult: number; daylightMult: number; coinMult: number;
  liftMult: number; infiniteDaylight: boolean; reverseControls: boolean;
};
export type WeeklyModeDef = {
  id: string; name: string; blurb: string; icon: string;
  modifiers: WeeklyModeModifier; eventCurrencyPerRun: number;
  startsAt: number; endsAt: number;
};
export type MonthlyEventDef = {
  id: string; name: string; blurb: string; icon: string;
  eventSkins: { id: string; name: string; perk: string; price: number; body: number; wing: number; belly: number; beak: number; speedMult: number; feverBonus: number; daylightBonus: number; magnetAlways: boolean; rarity: string; limitedTime: boolean }[];
  eventMissions: { id: string; title: string; desc: string; target: number; metric: string; reward: number }[];
  startsAt: number; endsAt: number;
};
export type CommunityChallengeDef = {
  id: string; name: string; blurb: string; icon: string;
  goalKind: string; goalTarget: number;
  milestones: { pct: number; reward: number; label: string }[];
  startsAt: number; endsAt: number;
};
export type EventState = {
  eventCurrency: number; sessionEventEarned: number; ownedEventItems: string[];
  communityProgress: { challengeId: string; personalContribution: number; claimedMilestones: number[] }[];
  completedEventMissions: string[];
};

export const WEEKLY_MODES: { id: string; name: string; blurb: string; icon: string; modifiers: WeeklyModeModifier; eventCurrencyPerRun: number }[] = [
  { id: "high_altitude", name: "High Altitude Week", blurb: "Gravity is halved — ride thermals to the stratosphere!", icon: "🎈",
    modifiers: { gravityMult: 0.5, speedMult: 1, daylightMult: 1, coinMult: 1, liftMult: 1.5, infiniteDaylight: false, reverseControls: false }, eventCurrencyPerRun: 8 },
  { id: "turbo_speed", name: "Turbo Week", blurb: "2x top speed. Hold on tight.", icon: "💨",
    modifiers: { gravityMult: 1, speedMult: 2, daylightMult: 1, coinMult: 1, liftMult: 1, infiniteDaylight: false, reverseControls: false }, eventCurrencyPerRun: 6 },
  { id: "golden_rain", name: "Golden Rain Week", blurb: "Coins are everywhere and worth double.", icon: "✨",
    modifiers: { gravityMult: 1, speedMult: 1, daylightMult: 1, coinMult: 2, liftMult: 1, infiniteDaylight: false, reverseControls: false }, eventCurrencyPerRun: 10 },
  { id: "long_day", name: "Long Day Week", blurb: "The sunset is twice as slow.", icon: "🌅",
    modifiers: { gravityMult: 1, speedMult: 1, daylightMult: 2, coinMult: 1, liftMult: 1, infiniteDaylight: false, reverseControls: false }, eventCurrencyPerRun: 7 },
  { id: "feather_fall", name: "Feather Fall Week", blurb: "Ultra-light gravity. Every landing is butter.", icon: "🪶",
    modifiers: { gravityMult: 0.35, speedMult: 0.9, daylightMult: 1, coinMult: 1, liftMult: 2, infiniteDaylight: false, reverseControls: false }, eventCurrencyPerRun: 9 },
  { id: "zero_g", name: "Zero-G Week", blurb: "Almost no gravity. Infinite airtime.", icon: "🚀",
    modifiers: { gravityMult: 0.12, speedMult: 1, daylightMult: 1, coinMult: 1, liftMult: 3, infiniteDaylight: false, reverseControls: false }, eventCurrencyPerRun: 12 },
  { id: "headwind", name: "Storm Chaser Week", blurb: "Constant headwind. Only the bold survive.", icon: "🌬",
    modifiers: { gravityMult: 1, speedMult: 0.85, daylightMult: 1, coinMult: 1.5, liftMult: 0.8, infiniteDaylight: false, reverseControls: false }, eventCurrencyPerRun: 11 },
  { id: "reverse", name: "Mirror World Week", blurb: "Everything is reversed. Relearn the hills.", icon: "🪞",
    modifiers: { gravityMult: 1, speedMult: 1, daylightMult: 1, coinMult: 1, liftMult: 1, infiniteDaylight: false, reverseControls: true }, eventCurrencyPerRun: 14 },
];

export const MONTHLY_EVENTS: { id: string; name: string; blurb: string; icon: string;
  eventSkins: MonthlyEventDef["eventSkins"]; eventMissions: MonthlyEventDef["eventMissions"] }[] = [
  { id: "spring_migration", name: "Spring Migration", blurb: "Cherry blossoms fill the sky!", icon: "🌸",
    eventSkins: [{ id: "sakura", name: "Sakura", perk: "Cherry blossom trail", price: 150, body: 0xffb7c5, wing: 0xff8fa8, belly: 0xfff0f5, beak: 0xffd700, speedMult: 1, feverBonus: 2, daylightBonus: 2, magnetAlways: false, rarity: "event_rare", limitedTime: true }],
    eventMissions: [{ id: "spring_petals10", title: "Petal Collector", desc: "Collect 10 sakura petals", target: 10, metric: "coins", reward: 50 }] },
  { id: "summer_solstice", name: "Summer Solstice", blurb: "The longest day. Sun coins everywhere.", icon: "☀",
    eventSkins: [{ id: "solstice", name: "Solstice", perk: "Golden feather trail", price: 200, body: 0xffd700, wing: 0xffa500, belly: 0xfff8dc, beak: 0xff6347, speedMult: 1.02, feverBonus: 3, daylightBonus: 4, magnetAlways: false, rarity: "event_legendary", limitedTime: true }],
    eventMissions: [{ id: "summer_coins50", title: "Sun Collector", desc: "Collect 50 sun coins", target: 50, metric: "coins", reward: 60 }] },
  { id: "autumn_fog", name: "Autumn Fog", blurb: "Mysterious fog rolls in.", icon: "🍂",
    eventSkins: [{ id: "maple", name: "Maple", perk: "Autumn leaf trail", price: 120, body: 0xcc5500, wing: 0xff8c00, belly: 0xffe4b5, beak: 0x8b4513, speedMult: 1, feverBonus: 0, daylightBonus: 6, magnetAlways: false, rarity: "event_common", limitedTime: true }],
    eventMissions: [{ id: "autumn_leaves20", title: "Leaf Peeper", desc: "Collect 20 golden leaves", target: 20, metric: "coins", reward: 70 }] },
  { id: "winter_aurora", name: "Winter Aurora", blurb: "Northern lights dance.", icon: "❄",
    eventSkins: [{ id: "frost", name: "Frost Wing", perk: "Ice crystal trail", price: 250, body: 0xb0e0e6, wing: 0xadd8e6, belly: 0xf0f8ff, beak: 0xffd700, speedMult: 1.03, feverBonus: 2, daylightBonus: 3, magnetAlways: false, rarity: "event_legendary", limitedTime: true }],
    eventMissions: [{ id: "winter_altitude300", title: "Aurora Hunter", desc: "Reach 300m altitude", target: 300, metric: "zenith", reward: 90 }] },
];

function weekKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function monthKey(now = new Date()): string { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function weekBounds(now = new Date()): { start: number; end: number } {
  const d = new Date(now); const day = (d.getDay() + 6) % 7;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
  return { start, end: start + 7 * 86400000 };
}
function monthBounds(now = new Date()): { start: number; end: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
  return { start, end };
}

export class Events {
  private weeklyDef: WeeklyModeDef;
  private monthlyDef: MonthlyEventDef | null;
  private communityDef: CommunityChallengeDef | null;
  constructor(private save: SaveData) {
    this.weeklyDef = this.computeWeekly();
    this.monthlyDef = this.computeMonthly();
    this.communityDef = this.computeCommunity();
  }
  activeWeeklyMode(): WeeklyModeDef { return this.weeklyDef; }
  activeMonthlyEvent(): MonthlyEventDef | null { return this.monthlyDef; }
  communityChallenge(): CommunityChallengeDef | null { return this.communityDef; }
  applyWeeklyModifiers(): WeeklyModeModifier { return this.weeklyDef.modifiers; }
  awardEventCurrency(distance: number, perfects: number): number {
    const base = this.weeklyDef.eventCurrencyPerRun;
    const bonus = Math.floor(distance / 500) + perfects;
    const total = base + bonus;
    this.getState().eventCurrency += total;
    this.getState().sessionEventEarned += total;
    this.save.persist(); return total;
  }
  resetSession(): void { this.getState().sessionEventEarned = 0; }
  sessionEarned(): number { return this.getState().sessionEventEarned; }
  view() {
    const state = this.getState(); const now = Date.now();
    return { weekly: this.weeklyDef, monthly: this.monthlyDef, community: this.communityDef,
      eventCurrency: state.eventCurrency, eventMissions: this.monthlyDef?.eventMissions ?? [],
      completedEventMissions: state.completedEventMissions,
      timeRemaining: { weekly: Math.max(0, this.weeklyDef.endsAt - now), monthly: this.monthlyDef ? Math.max(0, this.monthlyDef.endsAt - now) : 0 } };
  }
  private getState(): EventState {
    const s = this.save.state as any;
    if (!s.events) { s.events = { eventCurrency: 0, sessionEventEarned: 0, ownedEventItems: [], communityProgress: [], completedEventMissions: [] }; this.save.persist(); }
    return s.events;
  }
  private computeWeekly(): WeeklyModeDef {
    const key = weekKey(); const { start, end } = weekBounds();
    const rng = new SeededRandom(`${key}:weekly_mode`);
    const base = WEEKLY_MODES[rng.int(0, WEEKLY_MODES.length)]!;
    return { ...base, startsAt: start, endsAt: end };
  }
  private computeMonthly(): MonthlyEventDef | null {
    const key = monthKey(); const { start, end } = monthBounds();
    const rng = new SeededRandom(`${key}:monthly_event`);
    const base = MONTHLY_EVENTS[rng.int(0, MONTHLY_EVENTS.length)]!;
    return { ...base, startsAt: start, endsAt: end };
  }
  private computeCommunity(): CommunityChallengeDef | null {
    const key = weekKey(); const rng = new SeededRandom(`${key}:community`);
    const goals = [
      { kind: "total_distance", target: 1_000_000, name: "Million Meter March", blurb: "All pilots fly 1,000,000 meters" },
      { kind: "total_coins", target: 500_000, name: "Golden Sky", blurb: "Collect 500,000 coins as a community" },
      { kind: "total_perfects", target: 50_000, name: "Perfect Week", blurb: "Land 50,000 perfect launches" },
      { kind: "total_flights", target: 100_000, name: "Sky Traffic", blurb: "Complete 100,000 flights" },
    ];
    const { start, end } = weekBounds();
    const g = goals[rng.int(0, goals.length)]!;
    return { id: `comm_${key}`, name: g.name, blurb: g.blurb, icon: "🌍", goalKind: g.kind, goalTarget: g.target,
      milestones: [{ pct: 25, reward: 30, label: "25% — Bronze" }, { pct: 50, reward: 60, label: "50% — Silver" },
        { pct: 75, reward: 100, label: "75% — Gold" }, { pct: 100, reward: 200, label: "100% — Grand" }],
      startsAt: start, endsAt: end };
  }
}
