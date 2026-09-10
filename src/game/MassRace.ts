import * as THREE from "three";
import { Bird } from "./Bird";
import { BIRD_RADIUS } from "./constants";
import { LaunchSystem } from "./LaunchSystem";
import { clamp, SeededRandom } from "./math";
import type { TerrainSystem } from "./TerrainSystem";

/**
 * Mass race field (up to 40 rivals + you).
 *
 * Honesty note, reflected in the UI: every rival below is a *local pilot*
 * running the exact same `Bird.step()` physics you do on the exact same
 * terrain — not a scripted path and not a position lerp. They win or lose on
 * their own timing. Because the field is seeded, a given race is identical for
 * everyone who flies that seed, which is what makes the result comparable.
 *
 * When `VITE_MULTIPLAYER_URL` is configured, `MassRace` accepts authoritative
 * remote snapshots and those slots are driven by real people instead. Anything
 * still simulated locally is badged as a squadron pilot in the standings.
 */

export const MAX_RIVALS = 40;

/**
 * Measured optimum for this physics model: releasing ~70 world units before a
 * crest produces the best chained distance. Verified by sweeping the policy
 * against the real `Bird.step()` integrator (see scripts/sweep.ts).
 */
const OPTIMAL_LEAD = 70;

export type RivalKind = "local" | "remote";

export type Rival = {
  id: string;
  name: string;
  kind: RivalKind;
  bird: Bird;
  launch: LaunchSystem;
  /** how far ahead of a crest this pilot releases — their whole personality */
  lead: number;
  /** slow wobble in their crest judgement (amplitude, rate, phase) */
  wobbleAmp: number;
  wobbleRate: number;
  wobblePhase: number;
  /** reaction jitter in seconds */
  reaction: number;
  reactionT: number;
  diving: boolean;
  skill: number;
  hue: number;
  finished: boolean;
  finishTime: number;
  alive: boolean;
};

export type Standing = {
  id: string;
  name: string;
  distance: number;
  kind: RivalKind | "you";
  place: number;
  you: boolean;
  finished: boolean;
};

/** One entry in the live bird roster rendered across the top of the screen. */
export type RosterBird = {
  id: string;
  name: string;
  hue: number;
  /** 0..1 progress along the race */
  progress: number;
  place: number;
  you: boolean;
  remote: boolean;
  finished: boolean;
  emote: string;
};

/** Draft zone: how far behind a bird you must be to catch their slipstream. */
const DRAFT_BEHIND = 26;
const DRAFT_LATERAL = 6;
/** Peak drag reduction while perfectly tucked in behind someone. */
const DRAFT_MAX = 0.55;

/** Snapshot pushed by a real server when live multiplayer is configured. */
export type RemoteSnapshot = { id: string; name: string; x: number; y: number; rotation: number; finished?: boolean };

export interface NetTransport {
  readonly connected: boolean;
  send(x: number, y: number, rotation: number, distance: number): void;
  poll(): RemoteSnapshot[];
}

const NAMES = [
  "Aria", "Kestrel", "Nomi", "Tavi", "Wren", "Bex", "Juno", "Pike", "Sable", "Fen",
  "Rook", "Vale", "Ivy", "Cass", "Odin", "Lux", "Nyx", "Brann", "Skye", "Ozzy",
  "Mira", "Dune", "Perch", "Halo", "Yuki", "Kite", "Ash", "Sol", "Vex", "Pip",
  "Corin", "Delta", "Echo", "Faye", "Gull", "Hex", "Iris", "Jax", "Koa", "Lark",
];

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

export class MassRace {
  readonly group = new THREE.Group();
  rivals: Rival[] = [];
  private bodyMesh: THREE.InstancedMesh;
  private wingMesh: THREE.InstancedMesh;
  private readonly bodyGeo: THREE.SphereGeometry;
  private readonly wingGeo: THREE.SphereGeometry;
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly wingMat: THREE.MeshLambertMaterial;
  private capacity = 0;
  private transport: NetTransport | null = null;
  private flapT = 0;
  /** 0..1 how deep in someone's slipstream the player currently is. */
  draft = 0;
  private emotes = new Map<string, { text: string; at: number }>();
  private clock = 0;

  constructor() {
    this.bodyGeo = new THREE.SphereGeometry(0.62, 8, 6);
    this.wingGeo = new THREE.SphereGeometry(0.44, 6, 5);
    // Vertex colours let 40 differently-tinted birds share one draw call.
    this.bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.wingMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.95 });
    this.bodyMesh = new THREE.InstancedMesh(this.bodyGeo, this.bodyMat, 1);
    this.wingMesh = new THREE.InstancedMesh(this.wingGeo, this.wingMat, 1);
    this.group.add(this.bodyMesh, this.wingMesh);
    this.group.visible = false;
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  attachTransport(t: NetTransport | null): void {
    this.transport = t;
  }

  get active(): boolean {
    return this.group.visible && this.rivals.length > 0;
  }

  /** Builds a deterministic field for this seed. */
  spawn(count: number, seed: string, terrain: TerrainSystem, startX: number): void {
    const n = clamp(Math.floor(count), 0, MAX_RIVALS);
    this.ensureCapacity(n);
    const rng = new SeededRandom(`${seed}:field`);
    this.rivals = [];

    for (let i = 0; i < n; i++) {
      const bird = new Bird();
      bird.reset(startX, terrain.heightAt(startX) + BIRD_RADIUS);
      // Skill spread: a couple of aces, a thick middle, a few stragglers.
      const roll = rng.next();
      const skill = clamp(0.28 + Math.pow(roll, 1.6) * 0.72 + rng.range(-0.05, 0.05), 0.12, 1);
      // Release lead is the pilot's whole skill expression. Measured on this
      // physics model, the optimal anticipation is ~70 units before the crest;
      // weaker pilots scatter to either side of that band, which is what makes
      // the field spread out instead of flying as one clump.
      const errorSpread = (1 - skill) * 46;
      const lead = clamp(OPTIMAL_LEAD + rng.range(-errorSpread, errorSpread), 18, 132);
      this.rivals.push({
        id: `ai-${i}`,
        name: NAMES[i % NAMES.length]!,
        kind: "local",
        bird,
        launch: new LaunchSystem(),
        lead,
        // Nobody reads a crest perfectly every time. A slow per-pilot wobble
        // keeps the field genuinely separated instead of collapsing onto a
        // handful of identical discrete outcomes.
        wobbleAmp: (1 - skill) * 20 + 3,
        wobbleRate: rng.range(0.35, 1.25),
        wobblePhase: rng.range(0, Math.PI * 2),
        reaction: 0.16 - skill * 0.12 + rng.range(0, 0.05),
        reactionT: rng.range(0, 0.16),
        diving: false,
        skill,
        hue: rng.next(),
        finished: false,
        finishTime: 0,
        alive: true,
      });
    }
    this.group.visible = n > 0;
    this.writeInstances();
  }

  clear(): void {
    for (const r of this.rivals) r.bird.dispose();
    this.rivals = [];
    this.group.visible = false;
    this.bodyMesh.count = 0;
    this.wingMesh.count = 0;
  }

  /** Fixed-step update. Rivals use the identical physics contract as the player. */
  step(dt: number, terrain: TerrainSystem, finishLine: number, time: number): void {
    if (!this.group.visible) return;
    this.clock += dt;

    for (const r of this.rivals) {
      if (r.kind === "remote" || r.finished) continue;

      // Policy: hold through the descent and the climb, release just before the
      // crest. `lead` is the pilot's personal anticipation distance.
      r.reactionT -= dt;
      if (r.reactionT <= 0) {
        r.reactionT = r.reaction;
        const judged = r.lead + Math.sin(time * r.wobbleRate + r.wobblePhase) * r.wobbleAmp;
        // Cached crest index — a binary search, not a per-pilot ray march.
        r.diving = terrain.distanceToCrest(r.bird.x) > judged;
      }

      r.launch.observeInput(r.diving, time);
      r.launch.tick(dt);
      r.bird.step(dt, { diving: r.diving, fever: false, speedMult: 0.9 + r.skill * 0.2, boost: false }, terrain);
      if (r.bird.justLaunched) r.launch.evaluate(r.bird, terrain, time);
      if (r.bird.justLanded && r.bird.landingQuality < 0.8) r.launch.breakCombo();

      if (finishLine > 0 && r.bird.x >= finishLine && !r.finished) {
        r.finished = true;
        r.finishTime = time;
      }
    }

    if (this.transport?.connected) this.applyRemote(this.transport.poll());
  }

  private applyRemote(snapshots: RemoteSnapshot[]): void {
    for (const snap of snapshots) {
      let rival = this.rivals.find((r) => r.id === snap.id);
      if (!rival) {
        // Promote a local slot so the field size stays constant when a real
        // player joins mid-race.
        rival = this.rivals.find((r) => r.kind === "local");
        if (!rival) continue;
        rival.id = snap.id;
        rival.kind = "remote";
      }
      rival.name = snap.name.slice(0, 14);
      rival.bird.x = snap.x;
      rival.bird.y = snap.y;
      rival.bird.rotation = snap.rotation;
      if (snap.finished) rival.finished = true;
    }
  }

  /**
   * Slipstream drafting.
   *
   * Tucking in just behind another bird cuts your air drag, exactly like a
   * peloton. This turns a crowded 40-bird field from visual noise into a real
   * tactic: hunt a leader, sit in their wake to close the gap, then break out.
   * @returns a drag multiplier to feed into the player's next `Bird.step()`.
   */
  draftFor(x: number, y: number): number {
    if (!this.group.visible) {
      this.draft = 0;
      return 1;
    }
    let best = 0;
    for (const r of this.rivals) {
      const dx = r.bird.x - x; // positive => they are ahead of us
      if (dx <= 0 || dx > DRAFT_BEHIND) continue;
      const dy = Math.abs(r.bird.y - y);
      if (dy > DRAFT_LATERAL) continue;
      // Strongest right behind them, fading with both distance and offset.
      const along = 1 - dx / DRAFT_BEHIND;
      const lateral = 1 - dy / DRAFT_LATERAL;
      best = Math.max(best, along * lateral);
    }
    // Smooth so the boost never pops on and off between frames.
    this.draft += (best - this.draft) * 0.12;
    return 1 - this.draft * DRAFT_MAX;
  }

  /** Live roster for the top-of-screen bird bar. */
  roster(playerX: number, startX: number, finishDistance: number, playerName: string, playerHue = 0.06): RosterBird[] {
    const span = finishDistance > 0 ? finishDistance : 3000;
    const list: RosterBird[] = this.rivals.map((r) => ({
      id: r.id,
      name: r.name,
      hue: r.hue,
      progress: clamp((r.bird.x - startX) / span, 0, 1),
      place: 0,
      you: false,
      remote: r.kind === "remote",
      finished: r.finished,
      emote: this.emoteFor(r.id),
    }));
    list.push({
      id: "you",
      name: playerName,
      hue: playerHue,
      progress: clamp((playerX - startX) / span, 0, 1),
      place: 0,
      you: true,
      remote: false,
      finished: false,
      emote: this.emoteFor("you"),
    });
    list.sort((a, b) => b.progress - a.progress);
    list.forEach((r, i) => (r.place = i + 1));
    return list;
  }

  /** Shows a peer's emote for a couple of seconds above their bird. */
  showEmote(id: string, text: string): void {
    this.emotes.set(id, { text, at: this.clock });
  }

  private emoteFor(id: string): string {
    const e = this.emotes.get(id);
    if (!e) return "";
    if (this.clock - e.at > 2.5) {
      this.emotes.delete(id);
      return "";
    }
    return e.text;
  }

  /** Live standings including the player, sorted by distance. */
  standings(playerX: number, playerStartX: number, playerName: string, limit = 8): { rows: Standing[]; place: number; total: number } {
    const rows: Standing[] = this.rivals.map((r) => ({
      id: r.id,
      name: r.name,
      distance: Math.max(0, r.bird.x - playerStartX),
      kind: r.kind,
      place: 0,
      you: false,
      finished: r.finished,
    }));
    rows.push({
      id: "you",
      name: playerName,
      distance: Math.max(0, playerX - playerStartX),
      kind: "you",
      place: 0,
      you: true,
      finished: false,
    });
    rows.sort((a, b) => b.distance - a.distance);
    rows.forEach((r, i) => (r.place = i + 1));
    const place = rows.findIndex((r) => r.you) + 1;

    // Show the leaders plus a window around the player so the list is useful
    // whether you are 1st or 31st.
    const youIdx = place - 1;
    const merged: Standing[] = [];
    const push = (r: Standing): void => {
      if (merged.length < limit && !merged.some((m) => m.id === r.id)) merged.push(r);
    };
    for (const r of rows.slice(0, Math.min(3, rows.length))) push(r);
    const from = clamp(youIdx - 1, 0, Math.max(0, rows.length - 1));
    for (const r of rows.slice(from)) push(r);
    // Backfill from the top so the panel is always `limit` rows when possible.
    for (const r of rows) push(r);
    return { rows: merged, place, total: rows.length };
  }

  syncVisual(dt: number, cameraX: number): void {
    if (!this.group.visible) return;
    this.flapT += dt;

    let n = 0;
    for (const r of this.rivals) {
      // Cull hard: only birds near the camera cost anything to draw.
      if (Math.abs(r.bird.x - cameraX) > 260) continue;
      const flap = Math.sin(this.flapT * 14 + r.hue * 9) * 0.4;
      tmpColor.setHSL(r.hue, 0.62, r.kind === "remote" ? 0.68 : 0.55);

      tmpObj.position.set(r.bird.x, r.bird.y, -3.5 - (r.hue - 0.5) * 5);
      tmpObj.rotation.set(0, 0, r.bird.rotation * 0.9);
      tmpObj.scale.set(1.05, 0.9, 0.9);
      tmpObj.updateMatrix();
      this.bodyMesh.setMatrixAt(n, tmpObj.matrix);
      this.bodyMesh.setColorAt(n, tmpColor);

      tmpObj.position.y += 0.18;
      tmpObj.rotation.z += flap;
      tmpObj.scale.set(0.95, 0.2, 0.6);
      tmpObj.updateMatrix();
      this.wingMesh.setMatrixAt(n, tmpObj.matrix);
      this.wingMesh.setColorAt(n, tmpColor.offsetHSL(0, 0, 0.12));
      n++;
    }

    this.bodyMesh.count = n;
    this.wingMesh.count = n;
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.wingMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    if (this.wingMesh.instanceColor) this.wingMesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.clear();
    this.bodyGeo.dispose();
    this.wingGeo.dispose();
    this.bodyMat.dispose();
    this.wingMat.dispose();
    this.bodyMesh.dispose();
    this.wingMesh.dispose();
  }

  private ensureCapacity(n: number): void {
    if (n <= this.capacity) {
      this.bodyMesh.count = n;
      this.wingMesh.count = n;
      return;
    }
    this.group.remove(this.bodyMesh, this.wingMesh);
    this.bodyMesh.dispose();
    this.wingMesh.dispose();
    this.bodyMesh = new THREE.InstancedMesh(this.bodyGeo, this.bodyMat, n);
    this.wingMesh = new THREE.InstancedMesh(this.wingGeo, this.wingMat, n);
    this.bodyMesh.frustumCulled = false;
    this.wingMesh.frustumCulled = false;
    this.bodyMesh.castShadow = true;
    this.group.add(this.bodyMesh, this.wingMesh);
    this.capacity = n;
    this.writeInstances();
  }

  private writeInstances(): void {
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < this.capacity; i++) {
      this.bodyMesh.setColorAt(i, white);
      this.wingMesh.setColorAt(i, white);
    }
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    if (this.wingMesh.instanceColor) this.wingMesh.instanceColor.needsUpdate = true;
  }
}
