import * as THREE from "three";
import { ALT_CLOUDS, ALT_HIGH, ALT_SKY, MAGNET_RADIUS, MAGNET_RADIUS_NORMAL, RAMP_START } from "./constants";
import { hash01, SeededRandom } from "./math";
import type { TerrainSystem } from "./TerrainSystem";
import type { Bird } from "./Bird";

export type PickupKind =
  | "sun"
  | "rocket"
  | "magnet"
  | "shield"
  | "longglide"
  | "wingboost"
  | "feather"
  | "goldenwings"
  | "cloudboost";

export type CloudKind = "plain" | "boost" | "golden" | "wind" | "super";

export type CollectEvents = {
  onCoin: (x: number, y: number, gem: boolean) => void;
  onCloud: (kind: CloudKind, x: number, y: number) => void;
  onPickup: (kind: PickupKind, x: number, y: number) => void;
};

type Coin = { x: number; y: number; taken: boolean; gem: boolean; slot: number };
type Cloud = { kind: CloudKind; x: number; y: number; z: number; taken: boolean; sprite: THREE.Sprite; phase: number; drift: number };
type Pickup = { kind: PickupKind; x: number; y: number; taken: boolean; mesh: THREE.Mesh; phase: number };

export const PICKUP_STYLE: Record<PickupKind, { color: number; emissive: number; icon: string; label: string }> = {
  sun: { color: 0xffd24a, emissive: 0xff8a00, icon: "☀", label: "Sunlight" },
  rocket: { color: 0xff5a3a, emissive: 0x8a1400, icon: "🚀", label: "Speed Boost" },
  magnet: { color: 0x8a6cff, emissive: 0x2a10a0, icon: "🧲", label: "Magnet" },
  shield: { color: 0x5ad8ff, emissive: 0x0a5a8a, icon: "🛡", label: "Sea Shield" },
  longglide: { color: 0x7fe8c8, emissive: 0x0a6a58, icon: "🪁", label: "Long Glide" },
  wingboost: { color: 0xffa8e0, emissive: 0x8a1060, icon: "🕊", label: "Wing Boost" },
  feather: { color: 0xfff0c0, emissive: 0x6a5a10, icon: "🐦", label: "Feather" },
  goldenwings: { color: 0xffd76a, emissive: 0xa06000, icon: "✨", label: "Golden Wings" },
  cloudboost: { color: 0xc8e8ff, emissive: 0x2a5a8a, icon: "☁", label: "Cloud Boost" },
};

const MAX_COINS = 512;
const MAX_GEMS = 96;
const coinDummy = new THREE.Object3D();

const CLOUD_TINT: Record<CloudKind, string> = {
  plain: "255,255,255",
  boost: "196,240,255",
  golden: "255,226,150",
  wind: "205,255,232",
  super: "228,206,255",
};

export class Collectibles {
  readonly group = new THREE.Group();
  private readonly coinPool: Coin[] = [];
  private readonly cloudPool: Cloud[] = [];
  private readonly pickupPool: Pickup[] = [];
  private readonly activeCoins: Coin[] = [];
  private readonly activeClouds: Cloud[] = [];
  private readonly activePickups: Pickup[] = [];
  private readonly coinGeo: THREE.CylinderGeometry;
  private readonly gemGeo: THREE.OctahedronGeometry;
  private readonly coinMat: THREE.MeshLambertMaterial;
  private readonly gemMat: THREE.MeshLambertMaterial;
  private readonly coinMesh: THREE.InstancedMesh;
  private readonly gemMesh: THREE.InstancedMesh;
  private coinCursor = 0;
  private gemCursor = 0;
  private readonly pickupGeo: THREE.IcosahedronGeometry;
  private readonly pickupMats = new Map<PickupKind, THREE.MeshLambertMaterial>();
  private readonly cloudTex = new Map<CloudKind, THREE.CanvasTexture>();
  private readonly seedN: number;
  private readonly seedStr: string;
  private spawnedUntil = -1;
  private layer = 0;

  constructor(seedN: number, seedStr = String(seedN)) {
    this.seedN = seedN;
    this.seedStr = seedStr;
    this.coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12);
    this.gemGeo = new THREE.OctahedronGeometry(0.95, 0);
    this.coinMat = new THREE.MeshLambertMaterial({ color: 0xffd24a, emissive: 0x553300 });
    this.gemMat = new THREE.MeshLambertMaterial({ color: 0x9ae8ff, emissive: 0x1a5a8a, flatShading: true });
    // Hundreds of coin meshes are one of the largest draw-call costs. Coins
    // and sky gems each share an InstancedMesh, while their collision data is
    // still independent in the lightweight Coin records below.
    this.coinMesh = new THREE.InstancedMesh(this.coinGeo, this.coinMat, MAX_COINS);
    this.gemMesh = new THREE.InstancedMesh(this.gemGeo, this.gemMat, MAX_GEMS);
    this.coinMesh.count = MAX_COINS;
    this.gemMesh.count = MAX_GEMS;
    this.coinMesh.frustumCulled = false;
    this.gemMesh.frustumCulled = false;
    this.group.add(this.coinMesh, this.gemMesh);
    for (let i = 0; i < MAX_COINS; i++) this.hideCoinSlot(this.coinMesh, i);
    for (let i = 0; i < MAX_GEMS; i++) this.hideCoinSlot(this.gemMesh, i);
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.gemMesh.instanceMatrix.needsUpdate = true;
    this.pickupGeo = new THREE.IcosahedronGeometry(0.85, 0);
    for (const k of Object.keys(PICKUP_STYLE) as PickupKind[]) {
      const s = PICKUP_STYLE[k];
      this.pickupMats.set(k, new THREE.MeshLambertMaterial({ color: s.color, emissive: s.emissive, flatShading: true }));
    }
    for (const k of Object.keys(CLOUD_TINT) as CloudKind[]) this.cloudTex.set(k, makeCloudTexture(CLOUD_TINT[k]));
  }

  /** Render layer, so split-screen players only see their own pickups. */
  setLayer(layer: number): void {
    this.layer = layer;
    this.group.traverse((o) => o.layers.set(layer));
  }

  reset(): void {
    this.spawnedUntil = -1;
    for (const c of this.activeCoins) {
      c.taken = true;
      this.hideCoin(c);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.gemMesh.instanceMatrix.needsUpdate = true;
    for (const c of this.activeClouds) {
      c.taken = true;
      c.sprite.visible = false;
    }
    for (const p of this.activePickups) {
      p.taken = true;
      p.mesh.visible = false;
    }
    this.activeCoins.length = 0;
    this.activeClouds.length = 0;
    this.activePickups.length = 0;
  }

  update(dt: number, bird: Bird, terrain: TerrainSystem, magnetOn: boolean, time: number, ev: CollectEvents): void {
    const ahead = bird.x + 420;
    if (ahead > this.spawnedUntil) {
      this.spawnRange(Math.max(this.spawnedUntil, bird.x - 20), ahead, terrain);
      this.spawnedUntil = ahead;
    }

    const magnet = magnetOn ? MAGNET_RADIUS : MAGNET_RADIUS_NORMAL;
    for (let i = this.activeCoins.length - 1; i >= 0; i--) {
      const c = this.activeCoins[i]!;
      if (c.taken || c.x < bird.x - 30) {
        c.taken = true;
        this.hideCoin(c);
        this.activeCoins.splice(i, 1);
        continue;
      }
      const dx = bird.x - c.x;
      const dy = bird.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < magnet && d > 0.01) {
        const pull = magnetOn ? 52 : 18;
        c.x += (dx / d) * pull * dt;
        c.y += (dy / d) * pull * dt;
      }
      if (d < (c.gem ? 2.4 : 1.7)) {
        c.taken = true;
        this.hideCoin(c);
        this.activeCoins.splice(i, 1);
        ev.onCoin(c.x, c.y, c.gem);
        continue;
      }
      this.writeCoin(c, time);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.gemMesh.instanceMatrix.needsUpdate = true;

    for (let i = this.activeClouds.length - 1; i >= 0; i--) {
      const c = this.activeClouds[i]!;
      if (c.taken || c.x < bird.x - 60) {
        c.taken = true;
        c.sprite.visible = false;
        this.activeClouds.splice(i, 1);
        continue;
      }
      c.phase += dt;
      c.x += c.drift * dt;
      c.sprite.position.set(c.x, c.y + Math.sin(c.phase) * 0.6, c.z);
      if (c.kind !== "plain") {
        const p = 1 + Math.sin(c.phase * 2.4) * 0.05;
        c.sprite.scale.set(9.6 * p, 4.6 * p, 1);
      }
      if (Math.hypot(bird.x - c.x, bird.y - c.y) < 3.8 && Math.abs(c.z) < 8) {
        c.taken = true;
        c.sprite.visible = false;
        this.activeClouds.splice(i, 1);
        ev.onCloud(c.kind, c.x, c.y);
      }
    }

    for (let i = this.activePickups.length - 1; i >= 0; i--) {
      const p = this.activePickups[i]!;
      if (p.taken || p.x < bird.x - 30) {
        p.taken = true;
        p.mesh.visible = false;
        this.activePickups.splice(i, 1);
        continue;
      }
      p.phase += dt;
      p.mesh.position.set(p.x, p.y + Math.sin(p.phase * 2.2) * 0.35, 0);
      p.mesh.rotation.y += dt * 1.8;
      p.mesh.rotation.x += dt * 0.9;
      p.mesh.scale.setScalar(1 + Math.sin(p.phase * 4) * 0.08);
      if (Math.hypot(bird.x - p.x, bird.y - p.y) < 2.6) {
        p.taken = true;
        p.mesh.visible = false;
        this.activePickups.splice(i, 1);
        ev.onPickup(p.kind, p.x, p.y);
      }
    }
  }

  dispose(): void {
    this.coinGeo.dispose();
    this.gemGeo.dispose();
    this.coinMat.dispose();
    this.gemMat.dispose();
    this.pickupGeo.dispose();
    for (const m of this.pickupMats.values()) m.dispose();
    for (const t of this.cloudTex.values()) t.dispose();
    for (const c of this.cloudPool) (c.sprite.material as THREE.Material).dispose();
  }

  /* --------------------------------------------------------------- spawning */

  /**
   * Coins are never scattered — they are laid along the line a good player
   * would fly, so following them teaches the ideal trajectory:
   *   • lines hugging a downhill (dive here)
   *   • arcs leaping off a crest (release here)
   *   • tall arcs above big ramps tracing a perfect launch
   *   • rare gems parked in the cloud layers as a reward for flying high
   */
  private spawnRange(x0: number, x1: number, terrain: TerrainSystem): void {
    const step = 26;
    const start = Math.floor(x0 / step) * step;
    for (let x = start; x < x1; x += step) {
      if (x < 40 || terrain.isOcean(x)) continue;
      const cell = Math.floor(x / step);
      const rng = new SeededRandom(`${this.seedStr}:c:${cell}`);
      const slope = terrain.slopeAt(x);
      const curv = terrain.curvatureAt(x);
      const hh = terrain.heightAt(x);
      const lx = terrain.localX(x);
      const inRampZone = lx > RAMP_START - 30;

      // A crest: curvature convex and slope rolling from up to down.
      const isCrest = curv > 0.004 && Math.abs(slope) < 0.35;
      // A steep downhill — the place you want to be holding.
      const isDive = slope < -0.34;
      // A launch ramp — steep upslope heading toward a lip.
      const isRamp = slope > 0.42;

      if (isDive && !inRampZone && rng.next() < 0.85) {
        // follow the slope: a readable line of coins skimming the surface
        for (let i = 0; i < 5; i++) {
          const cx = x + i * 4.4;
          this.placeCoin(cx, terrain.heightAt(cx) + 2.2, false);
        }
      } else if (isRamp && rng.next() < 0.9) {
        // trace the launch arc off the lip
        const v = 52;
        const ang = Math.atan(terrain.slopeAt(x + 12));
        for (let i = 1; i <= 7; i++) {
          const t = i * 0.14;
          const cx = x + 12 + Math.cos(ang) * v * t;
          const cy = terrain.heightAt(x + 12) + 2 + Math.sin(ang) * v * t - 0.5 * 30 * t * t;
          if (cy > terrain.heightAt(cx) + 1.5) this.placeCoin(cx, cy, false);
        }
      } else if (isCrest && rng.next() < 0.55) {
        // small hop arc over the crest
        for (let i = 0; i < 5; i++) {
          const cx = x - 8 + i * 4;
          const bump = Math.sin((i / 4) * Math.PI) * 5;
          this.placeCoin(cx, terrain.heightAt(cx) + 2.4 + bump, false);
        }
      }

      // Sky rewards: gems and clouds live where only a good launch reaches.
      if (rng.next() < 0.38) {
        const tier = rng.next();
        const alt = tier < 0.55 ? ALT_SKY : tier < 0.86 ? ALT_CLOUDS : ALT_HIGH;
        const jitter = rng.range(-14, 22);
        const z = rng.range(-18, 12);
        this.placeCloud(this.pickCloudKind(rng, alt), x + rng.range(-10, 10), hh + alt + jitter, rng.next() * 6, rng.range(-1.5, 1.5), z);
      }
      if (rng.next() < 0.1) {
        const alt = rng.next() < 0.5 ? ALT_CLOUDS : ALT_HIGH;
        this.placeCoin(x + rng.range(-6, 6), hh + alt + rng.range(0, 30), true);
      }

      // Power-ups sit on crests and just past ramps so they reward good lines.
      if (!inRampZone && x > 150) {
        const r = rng.next();
        if (isCrest && r < 0.16) this.placePickup(this.pickPowerup(rng), x, hh + 3.2);
        else if (isRamp && r > 0.93) this.placePickup("rocket", x + 16, hh + 14);
        else if (r > 0.985) this.placePickup("sun", x, hh + 3);
      }
      if (lx > 700 && lx < RAMP_START && rng.next() < 0.06) this.placePickup("shield", x, hh + 3);
    }

    // Opening run: a friendly coin line teaching dive-then-release.
    if (this.spawnedUntil < 0) {
      for (let i = 0; i < 10; i++) {
        const x = 80 + i * 9;
        this.placeCoin(x, terrain.heightAt(x) + 2.3, false);
      }
    }
  }

  private pickCloudKind(rng: SeededRandom, alt: number): CloudKind {
    const r = rng.next();
    const high = alt >= ALT_HIGH;
    if (high) {
      if (r < 0.3) return "super";
      if (r < 0.6) return "golden";
      if (r < 0.8) return "wind";
      return "boost";
    }
    if (r < 0.1) return "golden";
    if (r < 0.24) return "boost";
    if (r < 0.34) return "wind";
    return "plain";
  }

  private pickPowerup(rng: SeededRandom): PickupKind {
    const pool: PickupKind[] = [
      "longglide",
      "wingboost",
      "magnet",
      "feather",
      "cloudboost",
      "longglide",
      "wingboost",
      "goldenwings",
    ];
    return pool[rng.int(0, pool.length)]!;
  }

  private placeCoin(x: number, y: number, gem: boolean): void {
    const coin = this.allocCoin(gem);
    coin.x = x;
    coin.y = y;
    coin.gem = gem;
    coin.taken = false;
    this.writeCoin(coin, 0);
    this.activeCoins.push(coin);
  }

  private placeCloud(kind: CloudKind, x: number, y: number, phase: number, drift: number, z = -2): void {
    const cloud = this.allocCloud(kind);
    cloud.kind = kind;
    cloud.x = x;
    cloud.y = y;
    cloud.z = z;
    cloud.phase = phase;
    cloud.drift = drift;
    cloud.taken = false;
    cloud.sprite.material.map = this.cloudTex.get(kind)!;
    cloud.sprite.material.needsUpdate = true;
    cloud.sprite.scale.set(kind === "plain" ? 9.2 : 9.6, kind === "plain" ? 4.4 : 4.6, 1);
    cloud.sprite.visible = true;
    cloud.sprite.position.set(x, y, z);
    this.activeClouds.push(cloud);
  }

  private placePickup(kind: PickupKind, x: number, y: number): void {
    const p = this.allocPickup(kind);
    p.x = x;
    p.y = y;
    p.phase = hash01(Math.floor(x), this.seedN) * 6;
    p.taken = false;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, 0);
    this.activePickups.push(p);
  }

  private allocCoin(gem: boolean): Coin {
    const idle = this.coinPool.find((c) => c.taken && c.gem === gem);
    if (idle) return idle;
    const slot = gem ? this.gemCursor++ : this.coinCursor++;
    if (slot >= (gem ? MAX_GEMS : MAX_COINS)) {
      // Pool pressure only occurs far behind the camera. Reuse an old inactive
      // visual slot rather than allocating a new draw call.
      const fallback = this.coinPool.find((c) => c.gem === gem && c.taken);
      if (fallback) return fallback;
      return { x: 0, y: -9999, taken: true, gem, slot: -1 };
    }
    const coin: Coin = { x: 0, y: 0, taken: true, gem, slot };
    this.coinPool.push(coin);
    return coin;
  }

  private writeCoin(c: Coin, time: number): void {
    if (c.slot < 0) return;
    const mesh = c.gem ? this.gemMesh : this.coinMesh;
    coinDummy.position.set(c.x, c.y + Math.sin(time * 5 + c.x * 0.35) * 0.22, 0);
    coinDummy.rotation.set(c.gem ? time * 0.8 : 0, c.gem ? time * 1.6 : time * 3.2, c.gem ? time * 0.45 : Math.PI / 2);
    coinDummy.scale.setScalar(1);
    coinDummy.updateMatrix();
    mesh.setMatrixAt(c.slot, coinDummy.matrix);
  }

  private hideCoin(c: Coin): void {
    if (c.slot < 0) return;
    this.hideCoinSlot(c.gem ? this.gemMesh : this.coinMesh, c.slot);
  }

  private hideCoinSlot(mesh: THREE.InstancedMesh, slot: number): void {
    coinDummy.position.set(0, -9999, 0);
    coinDummy.rotation.set(0, 0, 0);
    coinDummy.scale.setScalar(0.001);
    coinDummy.updateMatrix();
    mesh.setMatrixAt(slot, coinDummy.matrix);
  }

  private allocCloud(kind: CloudKind): Cloud {
    const idle = this.cloudPool.find((c) => c.taken || !c.sprite.visible);
    if (idle) return idle;
    const mat = new THREE.SpriteMaterial({ map: this.cloudTex.get(kind)!, transparent: true, depthWrite: false, opacity: 0.94 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(9.2, 4.4, 1);
    sprite.layers.set(this.layer);
    this.group.add(sprite);
    const cloud: Cloud = { kind, x: 0, y: 0, z: -2, taken: false, sprite, phase: 0, drift: 0 };
    this.cloudPool.push(cloud);
    return cloud;
  }

  private allocPickup(kind: PickupKind): Pickup {
    const idle = this.pickupPool.find((p) => (p.taken || !p.mesh.visible) && p.kind === kind);
    if (idle) return idle;
    const mesh = new THREE.Mesh(this.pickupGeo, this.pickupMats.get(kind)!);
    mesh.layers.set(this.layer);
    this.group.add(mesh);
    const p: Pickup = { kind, x: 0, y: 0, taken: false, mesh, phase: 0 };
    this.pickupPool.push(p);
    return p;
  }
}

function makeCloudTexture(tint: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 128);
  const blobs: [number, number, number][] = [
    [110, 72, 50],
    [150, 68, 44],
    [78, 74, 38],
    [180, 78, 34],
    [128, 50, 36],
  ];
  for (const [x, y, r] of blobs) {
    const grd = g.createRadialGradient(x, y, 4, x, y, r);
    grd.addColorStop(0, `rgba(${tint},0.96)`);
    grd.addColorStop(0.6, `rgba(${tint},0.56)`);
    grd.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
