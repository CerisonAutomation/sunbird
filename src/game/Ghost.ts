import * as THREE from "three";
import { GHOST_MAX_SAMPLES, GHOST_SAMPLE_DT } from "./constants";

type Sample = [number, number, number, number]; // t, x, y, rotation

type GhostRecord = { seed: string; distance: number; samples: Sample[] };

const KEY_PREFIX = "sunbird.ghost.";

export class GhostRecorder {
  private samples: Sample[] = [];
  private acc = 0;

  reset(): void {
    this.samples = [];
    this.acc = 0;
  }

  sample(dt: number, t: number, x: number, y: number, rotation: number): void {
    this.acc += dt;
    if (this.acc < GHOST_SAMPLE_DT) return;
    this.acc = 0;
    if (this.samples.length >= GHOST_MAX_SAMPLES) return;
    this.samples.push([Math.round(t * 100) / 100, Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(rotation * 100) / 100]);
  }

  /** Persists this run as the new best ghost if it beat the previous one. */
  commit(seed: string, distance: number): boolean {
    const prev = GhostRecorder.load(seed);
    if (prev && prev.distance >= distance) return false;
    const record: GhostRecord = { seed, distance, samples: this.samples };
    try {
      localStorage.setItem(KEY_PREFIX + seed, JSON.stringify(record));
    } catch {
      /* quota */
    }
    return true;
  }

  static load(seed: string): GhostRecord | null {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + seed);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<GhostRecord>;
      if (!Array.isArray(parsed.samples)) return null;
      return {
        seed,
        distance: Number(parsed.distance) || 0,
        samples: parsed.samples as Sample[],
      };
    } catch {
      return null;
    }
  }
}

/** Renders a translucent silhouette that replays a saved ghost run. */
export class GhostPlayer {
  readonly mesh: THREE.Group;
  private record: GhostRecord | null = null;
  private cursor = 0;
  private flapT = 0;
  private readonly body: THREE.Mesh;
  private readonly wingL: THREE.Mesh;
  private readonly wingR: THREE.Mesh;
  active = false;

  constructor() {
    this.mesh = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), mat);
    this.body.scale.set(1.15, 0.92, 0.92);
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.4, depthWrite: false });
    this.wingL = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 6), wingMat);
    this.wingR = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 6), wingMat);
    this.wingL.scale.set(0.95, 0.16, 0.55);
    this.wingR.scale.set(0.95, 0.16, 0.55);
    this.wingL.position.set(-0.05, 0.1, 0.42);
    this.wingR.position.set(-0.05, 0.1, -0.42);
    this.mesh.add(this.body, this.wingL, this.wingR);
    this.mesh.scale.setScalar(1.18);
    this.mesh.visible = false;
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.mesh);
  }

  load(seed: string): boolean {
    this.record = GhostRecorder.load(seed);
    this.cursor = 0;
    this.flapT = 0;
    this.active = Boolean(this.record && this.record.samples.length > 4);
    this.mesh.visible = false;
    return this.active;
  }

  bestDistance(): number {
    return this.record?.distance ?? 0;
  }

  /** Returns the ghost's x position at time t, or null once it has finished. */
  update(t: number, dt: number): number | null {
    if (!this.active || !this.record) return null;
    const s = this.record.samples;
    while (this.cursor < s.length - 2 && s[this.cursor + 1]![0] < t) this.cursor++;
    if (this.cursor >= s.length - 1) {
      this.mesh.visible = false;
      return null;
    }
    const a = s[this.cursor]!;
    const b = s[this.cursor + 1]!;
    const span = Math.max(0.0001, b[0] - a[0]);
    const u = Math.max(0, Math.min(1, (t - a[0]) / span));
    const x = a[1] + (b[1] - a[1]) * u;
    const y = a[2] + (b[2] - a[2]) * u;
    const rot = a[3] + (b[3] - a[3]) * u;
    this.mesh.visible = true;
    this.mesh.position.set(x, y, -1.4);
    this.mesh.rotation.z = rot * 0.92;
    this.flapT += dt;
    const flap = Math.sin(this.flapT * 14) * 0.4;
    this.wingL.rotation.z = 0.15 + flap;
    this.wingR.rotation.z = -0.15 - flap;
    return x;
  }

  reset(): void {
    this.cursor = 0;
    this.flapT = 0;
    this.mesh.visible = false;
  }
}
