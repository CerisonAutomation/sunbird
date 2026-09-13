import * as THREE from "three";
import { clamp, lerp } from "./math";

type PType = "dust" | "spark" | "splash" | "confetti" | "wake" | "feather";

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  r: number;
  g: number;
  b: number;
  type: PType;
};

const MAX = 700;

export class ParticleFX {
  readonly points: THREE.Points;
  private readonly particles: Particle[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly rings: THREE.Mesh[] = [];
  private cursor = 0;
  private budget = 1;

  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        attribute vec4 color;
        varying vec4 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (280.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.12, d) * vColor.a;
          gl_FragColor = vec4(vColor.rgb, a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;

    for (let i = 0; i < 4; i++) {
      const ringGeo = new THREE.RingGeometry(0.6, 0.85, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfff1a8,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, ringMat);
      mesh.visible = false;
      this.rings.push(mesh);
    }
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.points);
    for (const r of this.rings) scene.add(r);
  }

  emitDust(x: number, y: number, speed: number, slope: number): void {
    const n = speed > 40 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x - 0.4 + Math.random() * 0.6,
        y: y - 0.5,
        z: (Math.random() - 0.5) * 1.4,
        vx: -speed * 0.15 + (Math.random() - 0.5) * 3,
        vy: 1 + Math.random() * 3 - slope * 2,
        vz: (Math.random() - 0.5) * 2,
        life: 0.35 + Math.random() * 0.25,
        max: 0.5,
        size: 0.7 + Math.random() * 0.5,
        r: 0.78,
        g: 0.62,
        b: 0.38,
        type: "dust",
      });
    }
  }

  emitSparkle(x: number, y: number, r = 1, g = 0.85 + Math.random() * 0.15, b = 0.4): void {
    this.spawn({
      x,
      y,
      z: (Math.random() - 0.5) * 0.8,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      vz: (Math.random() - 0.5) * 3,
      life: 0.4 + Math.random() * 0.3,
      max: 0.6,
      size: 0.45 + Math.random() * 0.35,
      r,
      g,
      b,
      type: "spark",
    });
  }

  /** Horizontal wind streaks for gusts (drift against travel direction). */
  emitWind(x: number, y: number, strength: number): void {
    this.spawn({
      x: x + 30 + Math.random() * 30,
      y: y - 10 + Math.random() * 26,
      z: (Math.random() - 0.5) * 8,
      vx: -40 - strength * 30,
      vy: (Math.random() - 0.5) * 2,
      vz: 0,
      life: 0.5,
      max: 0.5,
      size: 0.35,
      r: 0.9,
      g: 0.96,
      b: 1,
      type: "wake",
    });
  }

  /** Rising motes inside a thermal column. */
  emitThermal(x: number, y: number, w: number): void {
    this.spawn({
      x: x + (Math.random() - 0.5) * w,
      y,
      z: (Math.random() - 0.5) * 3,
      vx: 0,
      vy: 6 + Math.random() * 5,
      vz: 0,
      life: 1.1,
      max: 1.1,
      size: 0.3 + Math.random() * 0.25,
      r: 1,
      g: 0.95,
      b: 0.75,
      type: "wake",
    });
  }

  emitAsh(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      this.spawn({
        x,
        y,
        z: (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 10,
        vy: -2 - Math.random() * 6,
        vz: (Math.random() - 0.5) * 4,
        life: 0.6,
        max: 0.6,
        size: 0.5,
        r: 0.35,
        g: 0.25,
        b: 0.3,
        type: "dust",
      });
    }
  }

  emitSplash(x: number, y: number): void {
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI;
      const p = 6 + Math.random() * 14;
      this.spawn({
        x,
        y,
        z: (Math.random() - 0.5) * 3,
        vx: Math.cos(a) * p * (Math.random() < 0.5 ? -1 : 1) * 0.4,
        vy: Math.sin(a) * p,
        vz: (Math.random() - 0.5) * 8,
        life: 0.5 + Math.random() * 0.4,
        max: 0.8,
        size: 0.5 + Math.random() * 0.7,
        r: 0.75,
        g: 0.9,
        b: 1,
        type: "splash",
      });
    }
  }

  emitConfetti(x: number, y: number): void {
    const colors = [
      [1, 0.45, 0.3],
      [1, 0.85, 0.3],
      [0.4, 0.85, 1],
      [0.5, 1, 0.55],
      [1, 0.5, 0.8],
    ];
    for (let i = 0; i < 40; i++) {
      const c = colors[i % colors.length]!;
      this.spawn({
        x,
        y,
        z: (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 18,
        vy: 6 + Math.random() * 16,
        vz: (Math.random() - 0.5) * 10,
        life: 0.9 + Math.random() * 0.6,
        max: 1.3,
        size: 0.5 + Math.random() * 0.5,
        r: c[0],
        g: c[1],
        b: c[2],
        type: "confetti",
      });
    }
  }

  emitCollect(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      this.spawn({
        x,
        y,
        z: 0,
        vx: (Math.random() - 0.5) * 8,
        vy: 2 + Math.random() * 8,
        vz: (Math.random() - 0.5) * 4,
        life: 0.3,
        max: 0.3,
        size: 0.4,
        r: 1,
        g: 0.84,
        b: 0.25,
        type: "spark",
      });
    }
  }

  /** Sparkle trail that flies from collect point toward the player. */
  emitCollectTrail(x: number, y: number, tx: number, ty: number, color = 0xffd24a): void {
    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / dist;
    const ny = dy / dist;
    for (let i = 0; i < 12; i++) {
      const spread = (Math.random() - 0.5) * 0.6;
      const speed = 18 + Math.random() * 24;
      this.spawn({
        x,
        y,
        z: (Math.random() - 0.5) * 2,
        vx: (nx + spread) * speed,
        vy: (ny + spread) * speed + 2,
        vz: (Math.random() - 0.5) * 4,
        life: 0.25 + Math.random() * 0.2,
        max: 0.4,
        size: 0.35 + Math.random() * 0.25,
        r: ((color >> 16) & 255) / 255,
        g: ((color >> 8) & 255) / 255,
        b: (color & 255) / 255,
        type: "spark",
      });
    }
  }

  emitBiomeAtmosphere(x: number, y: number, biomeId: string): void {
    if (Math.random() > 0.45 * this.budget) return;
    let r = 0.8, g = 0.9, b = 0.8;
    let sz = 0.4;
    let vx = (Math.random() - 0.5) * 4 - 3;
    let vy = (Math.random() - 0.5) * 3 - 0.5;
    let life = 0.9 + Math.random() * 0.7;
    let maxLife = 1.6;
    let type: PType = "wake";

    if (biomeId === "green") {
      // Leaf particles — green triangles drifting lazily
      r = 0.35 + Math.random() * 0.2;
      g = 0.7 + Math.random() * 0.25;
      b = 0.25 + Math.random() * 0.15;
      sz = 0.35 + Math.random() * 0.2;
      vx = -2 - Math.random() * 3;
      vy = -0.5 - Math.random() * 1.5;
      life = 1.2 + Math.random() * 0.8;
      maxLife = 2.0;
    } else if (biomeId === "sunset") {
      r = 1.0; g = 0.65; b = 0.45;
      sz = 0.55;
    } else if (biomeId === "tropical") {
      r = 0.4; g = 0.95; b = 0.85;
      sz = 0.45;
    } else if (biomeId === "desert") {
      // Sand particles — golden dots blowing fast
      r = 0.95; g = 0.82; b = 0.45;
      vx = -14 - Math.random() * 10;
      vy = (Math.random() - 0.5) * 2;
      sz = 0.3 + Math.random() * 0.2;
      life = 0.7 + Math.random() * 0.4;
      maxLife = 1.1;
    } else if (biomeId === "night") {
      // Firefly particles — glowing dots that wander slowly
      r = 0.6 + Math.random() * 0.3;
      g = 0.85 + Math.random() * 0.15;
      b = 0.3 + Math.random() * 0.3;
      vx = (Math.random() - 0.5) * 2;
      vy = (Math.random() - 0.5) * 1.5;
      sz = 0.3 + Math.random() * 0.25;
      life = 1.5 + Math.random() * 1.0;
      maxLife = 2.5;
    } else if (biomeId === "aurora") {
      // Snow particles — white dots falling gently
      r = 0.9 + Math.random() * 0.1;
      g = 0.92 + Math.random() * 0.08;
      b = 0.95 + Math.random() * 0.05;
      vx = (Math.random() - 0.5) * 3;
      vy = -1.5 - Math.random() * 2;
      sz = 0.25 + Math.random() * 0.2;
      life = 1.4 + Math.random() * 0.8;
      maxLife = 2.2;
    }

    this.spawn({
      x: x + 15 + Math.random() * 25,
      y: y + (Math.random() - 0.5) * 18,
      z: (Math.random() - 0.5) * 6,
      vx,
      vy,
      vz: (Math.random() - 0.5) * 2,
      life,
      max: maxLife,
      size: sz,
      r,
      g,
      b,
      type,
    });
  }

  /** Soft golden motes rising around the bird when soaring at altitude — magical feel */
  emitSoarMote(x: number, y: number, altitude: number): void {
    if (this.budget < 0.35) return;
    const t = Math.min(1, (altitude - 18) / 60);  // 0..1 as altitude climbs
    this.spawn({
      x: x + (Math.random() - 0.5) * 3,
      y: y - 0.5 + Math.random() * 1.5,
      z: (Math.random() - 0.5) * 2,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 1.5 + t * 2 + Math.random() * 2,   // rises faster at high altitude
      vz: (Math.random() - 0.5) * 0.8,
      life: 0.8 + Math.random() * 0.8,
      max: 1.6,
      size: 0.22 + t * 0.18,
      r: 1.0,
      g: 0.88 + t * 0.12,
      b: 0.4 + t * 0.4,   // warm gold → cool white at extreme altitude
      type: "spark",
    });
  }

  emitWingTrails(x: number, y: number, speed: number): void {
    if (this.budget < 0.5) return;
    const a = Math.min(1, speed / 60);  // ramp in faster — visible at lower speeds
    const base = 0.12 + a * 0.28;  // always a minimum size, grows with speed
    this.spawn({
      x: x - 0.6,
      y: y + 0.15,
      z: 0.5,
      vx: -Math.max(speed, 8) * 0.18,
      vy: (Math.random() - 0.5) * 1.5,
      vz: 0.8,
      life: 0.28 + a * 0.12,
      max: 0.40,
      size: base,
      r: 0.88,
      g: 0.94,
      b: 1.0,
      type: "wake",
    });
    this.spawn({
      x: x - 0.6,
      y: y + 0.15,
      z: -0.5,
      vx: -Math.max(speed, 8) * 0.18,
      vy: (Math.random() - 0.5) * 1.5,
      vz: -0.8,
      life: 0.28 + a * 0.12,
      max: 0.40,
      size: base,
      r: 0.88,
      g: 0.94,
      b: 1.0,
      type: "wake",
    });
  }

  /** Small white triangular feathers floating behind the bird during flight. */
  emitFeather(x: number, y: number, speed: number, banking: number): void {
    if (this.budget < 0.4 || Math.random() > 0.35) return;
    this.spawn({
      x: x - 0.8 + Math.random() * 0.4,
      y: y + 0.1 + Math.random() * 0.3,
      z: (Math.random() - 0.5) * 1.2,
      vx: -speed * 0.12 - Math.random() * 2,
      vy: -0.3 + Math.random() * 1.2,
      vz: banking * 0.5 + (Math.random() - 0.5) * 1.5,
      life: 0.6 + Math.random() * 0.5,
      max: 1.0,
      size: 0.28 + Math.random() * 0.2,
      r: 0.98,
      g: 0.96,
      b: 0.92,
      type: "feather",
    });
  }

  /** Spiral particle trails from wing tips during banking. */
  emitWingtipVortex(x: number, y: number, z: number, speed: number, banking: number): void {
    if (this.budget < 0.4 || Math.abs(banking) < 0.08) return;
    const count = Math.abs(banking) > 0.2 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.3 + Math.random() * 0.4;
      this.spawn({
        x: x - 0.5,
        y: y + Math.sin(angle) * radius,
        z: z + Math.cos(angle) * radius,
        vx: -speed * 0.15,
        vy: Math.cos(angle) * 2.5 * Math.sign(banking),
        vz: -Math.sin(angle) * 2.5 * Math.sign(banking),
        life: 0.3 + Math.random() * 0.2,
        max: 0.45,
        size: 0.25 + Math.random() * 0.15,
        r: 0.75,
        g: 0.88,
        b: 1.0,
        type: "spark",
      });
    }
  }

  /** Heat-shimmer-like particle effect around the bird at max speed. */
  emitSpeedShimmer(x: number, y: number, speed: number): void {
    if (this.budget < 0.3 || Math.random() > 0.5) return;
    const a = Math.min(1, (speed - 80) / 40);
    this.spawn({
      x: x + (Math.random() - 0.5) * 2.0,
      y: y + (Math.random() - 0.5) * 1.6,
      z: (Math.random() - 0.5) * 0.8,
      vx: -speed * 0.08 + (Math.random() - 0.5) * 3,
      vy: 1.5 + Math.random() * 3,
      vz: (Math.random() - 0.5) * 1,
      life: 0.2 + Math.random() * 0.15,
      max: 0.35,
      size: 0.3 * a,
      r: 1.0,
      g: 0.97,
      b: 0.9,
      type: "feather",
    });
  }

  emitSonicBoom(x: number, y: number): void {
    this.burstRing(x, y, 0xffffff);
    this.burstRing(x + 2, y, 0xafe8ff);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.spawn({
        x,
        y,
        z: 0,
        vx: Math.cos(a) * 22,
        vy: Math.sin(a) * 22,
        vz: (Math.random() - 0.5) * 6,
        life: 0.45,
        max: 0.45,
        size: 0.6,
        r: 0.8,
        g: 0.92,
        b: 1.0,
        type: "spark",
      });
    }
  }

  burstRing(x: number, y: number, color = 0xfff2a3): void {
    const ring = this.rings.find((r) => !r.visible) ?? this.rings[0]!;
    ring.visible = true;
    ring.position.set(x, y, 0.8);
    ring.scale.setScalar(0.3);
    const mat = ring.material as THREE.MeshBasicMaterial;
    mat.opacity = 1.0;
    mat.color.setHex(color);
    ring.userData.life = 1;
    // Emit a few trailing sparkles for extra punch
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.spawn({
        x, y, z: 0,
        vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, vz: 0,
        life: 0.25, max: 0.25,
        size: 0.3,
        r: ((color >> 16) & 255) / 255,
        g: ((color >> 8) & 255) / 255,
        b: (color & 255) / 255,
        type: "spark",
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        if (this.particles.length > 1) {
          this.particles[i] = this.particles[this.particles.length - 1]!;
        }
        this.particles.length--;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.type === "dust" || p.type === "confetti" || p.type === "splash") p.vy -= 18 * dt;
      if (p.type === "spark") {
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
      if (p.type === "feather") {
        // Feathers float — gentle descent, slight drift, flutter
        p.vy -= 1.8 * dt;
        p.vx *= 0.98;
        p.vz += Math.sin(p.life * 12) * 0.4 * dt;
      }
    }

    // Only the live prefix of the buffers is written and uploaded; everything
    // past `n` is hidden by setDrawRange instead of being zeroed each frame.
    const n = Math.min(this.particles.length, MAX);
    for (let i = 0; i < n; i++) {
      const p = this.particles[i]!;
      const o = i * 3;
      this.pos[o] = p.x;
      this.pos[o + 1] = p.y;
      this.pos[o + 2] = p.z;
      const a = p.life / p.max;
      const c = i * 4;
      this.col[c] = p.r;
      this.col[c + 1] = p.g;
      this.col[c + 2] = p.b;
      this.col[c + 3] = p.type === "dust" ? a * 0.55 : p.type === "wake" ? a * 0.5 : p.type === "feather" ? a * 0.7 : a;
      this.size[i] = p.size * (0.5 + a);
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    if (n > 0) {
      const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
      const colAttr = geo.getAttribute("color") as THREE.BufferAttribute;
      const sizeAttr = geo.getAttribute("size") as THREE.BufferAttribute;
      posAttr.addUpdateRange(0, n * 3);
      colAttr.addUpdateRange(0, n * 4);
      sizeAttr.addUpdateRange(0, n);
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
    }
    this.points.visible = n > 0;

    for (const ring of this.rings) {
      if (!ring.visible) continue;
      ring.userData.life = (ring.userData.life as number) - dt * 1.8;
      const life = ring.userData.life as number;
      if (life <= 0) {
        ring.visible = false;
        continue;
      }
      const s = lerp(Number(ring.scale.x), 4.5, 0.12);
      ring.scale.setScalar(s);
      (ring.material as THREE.MeshBasicMaterial).opacity = clamp(life, 0, 0.9);
    }
  }

  setBudget(mult: number): void {
    this.budget = Math.max(0.2, Math.min(1, mult));
  }

  clear(): void {
    this.particles.length = 0;
    for (const r of this.rings) r.visible = false;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    for (const r of this.rings) {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    }
  }

  private spawn(p: Particle): void {
    if (this.particles.length >= MAX) {
      this.particles[this.cursor % MAX] = p;
      this.cursor += 1;
    } else {
      this.particles.push(p);
    }
    p.max = p.life;
  }
}
