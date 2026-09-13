import { Bird } from "../src/game/Bird";
import { LaunchSystem } from "../src/game/LaunchSystem";
import { TerrainSystem } from "../src/game/TerrainSystem";
import { PHYS_DT, BIRD_RADIUS, MAX_SPEED } from "../src/game/constants";

const terrain = new TerrainSystem("2025-01-01");
const bird = new Bird();
const launch = new LaunchSystem();

/** A simple "good player" AI: hold on downhills, release just before crests. */
function ai(x: number): boolean {
  // A human anticipates: start tucking just before the ground falls away,
  // and let go as soon as the next ramp starts lifting.
  return terrain.slopeAt(x + 10) < -0.02;
}

function run(policy: (x: number) => boolean, secs: number) {
  bird.reset(64, terrain.heightAt(64) + BIRD_RADIUS);
  launch.reset();
  let t = 0, maxAlt = 0, maxSpd = 0, perfects = 0, greats = 0, goods = 0, best = 0, launches = 0, airT = 0;
  while (t < secs) {
    const diving = policy(bird.x);
    launch.observeInput(diving, t);
    launch.tick(PHYS_DT);
    bird.step(PHYS_DT, { diving, fever: false, speedMult: 1, boost: false }, terrain);
    if (!bird.grounded) airT += PHYS_DT;
    if (bird.justLaunched) {
      launches++;
      const r = launch.evaluate(bird, terrain, t);
      if (r.rating === "perfect") perfects++;
      else if (r.rating === "great") greats++;
      else if (r.rating === "good") goods++;
      best = Math.max(best, launch.combo);
    }
    if (bird.justLanded && bird.landingQuality < 0.8) launch.breakCombo();
    maxAlt = Math.max(maxAlt, bird.altitude);
    maxSpd = Math.max(maxSpd, bird.speed());
    t += PHYS_DT;
  }
  return { dist: bird.x - 64, maxAlt, maxSpd, launches, perfects, greats, goods, best, airPct: (airT/secs)*100 };
}

const skilled = run(ai, 60);
const masher = run(() => true, 60);          // holds forever
const idler  = run(() => false, 60);         // never holds
// A precise player: tuck the moment the ground starts dropping, release the
// moment it starts rising again.
// True technique: stay tucked through the descent AND the climb, release only
// as the lip approaches so the ramp fires you off it.
function distToCrest(x: number): number {
  let prev = terrain.slopeAt(x);
  for (let d = 2; d < 120; d += 2) {
    const s2 = terrain.slopeAt(x + d);
    if (prev > 0 && s2 <= 0) return d;
    prev = s2;
  }
  return 999;
}
const expert = run((x) => distToCrest(x) > 16, 60);
const early  = run((x) => distToCrest(x) > 40, 60);

console.log("skilled ", JSON.stringify(skilled, (_k, v) => typeof v === "number" ? +v.toFixed(1) : v));
console.log("hold-all", JSON.stringify(masher,  (_k, v) => typeof v === "number" ? +v.toFixed(1) : v));
console.log("no-hold ", JSON.stringify(idler,   (_k, v) => typeof v === "number" ? +v.toFixed(1) : v));
console.log("expert  ", JSON.stringify(expert,  (_k, v) => typeof v === "number" ? +v.toFixed(1) : v));
console.log("early   ", JSON.stringify(early,   (_k, v) => typeof v === "number" ? +v.toFixed(1) : v));

// Terrain smoothness over the START of the map only.
//
// This deliberately does not cover a whole flight: past x~6000 the map has
// coastlines where land at ~98 m drops straight into ocean, and those push
// |curvature| to ~71 and single-sample height jumps to ~86. They are
// intentional, so bounding curvature across the full range would fail on
// correct terrain. The whole-map invariant — "the only discontinuities are
// coastlines, never inland cliffs" — lives in
// src/game/__tests__/terrain-integrity.test.ts, which scans -500..40000.
let worst = 0, worstX = 0;
for (let x = 100; x < 6000; x += 1) {
  const c = Math.abs(terrain.curvatureAt(x));
  if (c > worst) { worst = c; worstX = x; }
}
// Radius of the tightest turn. toFixed(1) used to print this as "0.0 m", which
// reads as a degenerate kink when the real value is ~0.04 m.
console.log("max |curvature|", worst.toFixed(4), "at x=", worstX, "(radius", (1 / worst).toFixed(4), "m)");

/**
 * Assertions.
 *
 * This script used to only print, so it could never fail — a "check" that
 * cannot fail is a report, and it was documented as a verification step. These
 * invariants are the ones the physics actually promises; each threshold sits
 * well clear of the measured value so the gate is meaningful without being
 * flaky. Measured baseline: skilled 998.8 / hold-all 198.2 / no-hold 125.8 /
 * expert 198.3 / early 510.7, max |curvature| 27.42.
 */
const failures: string[] = [];
function check(ok: boolean, label: string, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label} — ${detail}`);
  if (!ok) failures.push(label);
}

check(
  skilled.dist > masher.dist,
  "skill beats button-mashing",
  `skilled ${skilled.dist.toFixed(1)}m vs hold-all ${masher.dist.toFixed(1)}m`,
);
check(
  skilled.dist > idler.dist,
  "skill beats doing nothing",
  `skilled ${skilled.dist.toFixed(1)}m vs no-hold ${idler.dist.toFixed(1)}m`,
);
check(
  idler.dist < masher.dist,
  "holding is better than never holding",
  `no-hold ${idler.dist.toFixed(1)}m vs hold-all ${masher.dist.toFixed(1)}m`,
);
check(skilled.launches > 0, "the skilled policy actually launches", `${skilled.launches} launches`);
check(
  skilled.dist > 500,
  "a good run clears a meaningful distance",
  `${skilled.dist.toFixed(1)}m (floor 500m)`,
);

for (const [name, r] of [["skilled", skilled], ["hold-all", masher], ["no-hold", idler], ["expert", expert], ["early", early]] as const) {
  // fever is false for every policy here, so MAX_SPEED (not MAX_SPEED_FEVER)
  // is the ceiling. A breach means the clamp broke.
  check(
    r.maxSpd > 0 && r.maxSpd <= MAX_SPEED + 1e-6,
    `${name} stays under the speed cap`,
    `${r.maxSpd.toFixed(1)} u/s vs cap ${MAX_SPEED}`,
  );
  check(Number.isFinite(r.dist) && r.dist > 0, `${name} makes progress`, `${r.dist.toFixed(1)}m`);
  check(Number.isFinite(r.maxAlt) && r.maxAlt >= 0, `${name} altitude is sane`, `${r.maxAlt.toFixed(1)}m`);
}

// 27.42 measured; 60 is >2x headroom. Above that the terrain has a real kink
// that would pop the bird. Named so the message cannot drift from the test.
const CURVATURE_LIMIT = 60;
check(worst < CURVATURE_LIMIT, "terrain curvature bounded", `max ${worst.toFixed(2)} (limit ${CURVATURE_LIMIT})`);
check(worst > 0, "terrain actually curves", `max ${worst.toFixed(2)}`);

if (failures.length > 0) {
  console.error(`\nphyscheck FAILED: ${failures.length} check(s) — ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`\nphyscheck PASSED — all invariants hold.`);
