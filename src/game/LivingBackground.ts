import * as THREE from "three";

/**
 * LivingBackground — distant migratory flocks drifting through the play sky.
 *
 * The whole flock renders as exactly THREE instanced draw calls (body, left
 * wing, right wing) regardless of bird count, so it is effectively free on
 * low-end hardware. Depth is conveyed with aerial perspective: far birds are
 * smaller and paler, near birds darker — no transparency sorting needed.
 *
 * Motion is slow and directional (flocks migrate leftward past the player),
 * with per-bird wingbeat phase so the flock never strobes in unison.
 */

const FLOCKS = 3;
const BIRDS_PER_FLOCK = 5;
const TOTAL = FLOCKS * BIRDS_PER_FLOCK;

type FlockState = {
  x: number;
  y: number;
  speed: number;
  depth: number;
  phase: number;
  wobble: number;
};

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

export class LivingBackground extends THREE.Group {
  private readonly bodyMesh: THREE.InstancedMesh;
  private readonly wingL: THREE.InstancedMesh;
  private readonly wingR: THREE.InstancedMesh;
  private readonly clouds: THREE.Sprite[] = [];
  private readonly cloudTex: THREE.CanvasTexture;
  private readonly flocks: FlockState[] = [];
  private readonly bodyGeo: THREE.BufferGeometry;
  private readonly wingGeo: THREE.BufferGeometry;
  private readonly birdMat: THREE.MeshBasicMaterial;
  // Extra sky life: hot-air balloons + stunt kites + paper lanterns.
  // Each is ONE InstancedMesh (3 extra draw calls total), all wrapping.
  private readonly balloonMesh: THREE.InstancedMesh;
  private readonly kiteMesh: THREE.InstancedMesh;
  private readonly lanternMesh: THREE.InstancedMesh;
  private readonly balloons: { ox: number; oy: number; depth: number; speed: number; phase: number; scale: number; hue: number }[] = [];
  private readonly kites: { ox: number; oy: number; depth: number; speed: number; phase: number; scale: number; hue: number }[] = [];
  private readonly lanterns: { ox: number; oy: number; depth: number; speed: number; phase: number; scale: number; hue: number }[] = [];
  private readonly shooters: THREE.Sprite[] = [];
  private shootT = 5;
  private reducedMotion = false;
  private t = 0;
  private anchorX = 0;

  constructor() {
    super();

    // Body: a small stretched diamond pointing +x (direction of travel).
    this.bodyGeo = new THREE.BufferGeometry();
    this.bodyGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          // top diamond
          0.9, 0.02, 0, -0.7, 0.02, 0.12, -0.7, 0.02, -0.12,
          // bottom diamond
          0.9, -0.02, 0, -0.7, -0.02, 0.12, -0.7, -0.02, -0.12,
        ],
        3,
      ),
    );
    this.bodyGeo.setIndex([0, 1, 2, 3, 5, 4]);

    // Wing: pivots at the origin (wing root), extends along +z. Flapping is a
    // rotation around the x-axis applied per-instance, so one geometry serves
    // both sides (mirrored by rotation sign).
    this.wingGeo = new THREE.BufferGeometry();
    this.wingGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          0.35, 0, 0.05, // root-front
          -0.45, 0, 0.05, // root-back
          0.05, 0.06, 1.25, // wing tip (slightly swept back, raised)
        ],
        3,
      ),
    );
    this.wingGeo.setIndex([0, 1, 2]);
    this.wingGeo.computeVertexNormals();

    this.birdMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.bodyMesh = new THREE.InstancedMesh(this.bodyGeo, this.birdMat, TOTAL);
    this.wingL = new THREE.InstancedMesh(this.wingGeo, this.birdMat, TOTAL);
    this.wingR = new THREE.InstancedMesh(this.wingGeo, this.birdMat, TOTAL);
    for (const m of [this.bodyMesh, this.wingL, this.wingR]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.add(m);
    }

    // Soft background cloud sprites at varying depths.
    this.cloudTex = makeCloudTexture();
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.cloudTex,
        transparent: true,
        opacity: 0.1 + (i / 9) * 0.12,
        depthWrite: false,
        fog: false,
      });
      const sp = new THREE.Sprite(mat);
      const scale = 14 + (i / 9) * 22;
      sp.scale.set(scale, scale * 0.42, 1);
      sp.userData = {
        ox: (i / 9) * 220 - 60,
        oy: 30 + (i % 4) * 11,
        depth: 0.04 + (i / 9) * 0.18,
      };
      this.clouds.push(sp);
      this.add(sp);
    }

    // Three flocks at different depths and drift speeds.
    for (let f = 0; f < FLOCKS; f++) {
      this.flocks.push({
        x: f * 90 - 40,
        y: 34 + f * 12,
        speed: 2.2 + f * 0.7,
        depth: f / (FLOCKS - 1),
        phase: f * 2.1,
        wobble: 0.6 + f * 0.3,
      });
    }

    // Balloons: slow, high, colorful — 7 instances, 1 draw call
    {
      const g = new THREE.SphereGeometry(1.6, 10, 8);
      g.scale(1, 1.18, 1);
      const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92 });
      this.balloonMesh = new THREE.InstancedMesh(g, m, 7);
      this.balloonMesh.frustumCulled = false;
      this.balloonMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.add(this.balloonMesh);
      for (let i = 0; i < 7; i++) {
        this.balloons.push({
          ox: i * 47 - 80, oy: 42 + (i % 3) * 14, depth: 0.08 + (i % 3) * 0.07,
          speed: 0.7 + (i % 4) * 0.25, phase: i * 1.31, scale: 0.9 + (i % 3) * 0.5,
          hue: (i * 0.13) % 1,
        });
      }
    }
    // Kites: fast darts with figure-eight wobble — 8 instances, 1 draw call
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.9, 0, -0.7, -0.5, 0, 0.7, -0.5, 0], 3));
      g.setIndex([0, 1, 2]);
      g.computeVertexNormals();
      const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      this.kiteMesh = new THREE.InstancedMesh(g, m, 8);
      this.kiteMesh.frustumCulled = false;
      this.kiteMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.add(this.kiteMesh);
      for (let i = 0; i < 8; i++) {
        this.kites.push({
          ox: i * 37 - 60, oy: 26 + (i % 4) * 9, depth: 0.15 + (i % 3) * 0.09,
          speed: 3.2 + (i % 3) * 1.1, phase: i * 2.17, scale: 0.8 + (i % 2) * 0.5,
          hue: (0.02 + i * 0.11) % 1,
        });
      }
    }
    // Lanterns: warm rising drift — 12 instances, 1 draw call
    {
      const g = new THREE.SphereGeometry(0.55, 8, 6);
      g.scale(1, 1.25, 1);
      const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 });
      this.lanternMesh = new THREE.InstancedMesh(g, m, 12);
      this.lanternMesh.frustumCulled = false;
      this.lanternMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.add(this.lanternMesh);
      for (let i = 0; i < 12; i++) {
        this.lanterns.push({
          ox: i * 29 - 90, oy: 18 + (i % 5) * 7, depth: 0.2 + (i % 4) * 0.08,
          speed: 1.1 + (i % 3) * 0.4, phase: i * 0.97, scale: 0.7 + (i % 3) * 0.3,
          hue: 0.08 + (i % 3) * 0.03,
        });
      }
    }
    // Shooting-star streaks (pooled sprites)
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.cloudTex, color: 0xfff6d8, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(14, 2.2, 1);
      sp.userData = { t: 99, dur: 0.9 };
      this.shooters.push(sp);
      this.add(sp);
    }

    this.writeInstances(0);
  }

  /** Reduced-motion users get a static flock painting instead of drift. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) this.writeInstances(this.t);
  }

  update(dt: number, camX: number, camY: number): void {
    if (!this.reducedMotion) this.t += dt;
    this.anchorX = camX;
    this.writeInstances(this.t);
    for (const sp of this.clouds) {
      const d = sp.userData as { ox: number; oy: number; depth: number };
      let wx = d.ox - (this.reducedMotion ? 0 : this.t * d.depth * 6);
      const span = 260;
      wx = ((wx - camX + span * 0.5) % span + span) % span - span * 0.5;
      sp.position.set(camX + wx, d.oy + camY * 0.05, -46 - d.depth * 60);
    }
    this.writeTraffic(this.t, camX, camY, dt);
  }

  private wrapX(ox: number, drift: number, span: number): number {
    const wx = ox - drift;
    return ((wx - this.anchorX + span * 0.5) % span + span) % span - span * 0.5;
  }

  private writeTraffic(time: number, camX: number, camY: number, dt: number): void {
    const still = this.reducedMotion;
    for (let i = 0; i < this.balloons.length; i++) {
      const b = this.balloons[i]!;
      const wx = this.wrapX(b.ox, still ? 0 : time * b.speed * 2.2, 320);
      const bob = Math.sin(time * 0.6 + b.phase) * 1.6;
      dummy.position.set(camX + wx, b.oy + bob + camY * 0.06, -58 - b.depth * 40);
      dummy.rotation.set(0, Math.sin(time * 0.4 + b.phase) * 0.12, 0);
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      this.balloonMesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHSL(b.hue, 0.72, 0.58);
      this.balloonMesh.setColorAt(i, tmpColor);
    }
    this.balloonMesh.instanceMatrix.needsUpdate = true;
    if (this.balloonMesh.instanceColor) this.balloonMesh.instanceColor.needsUpdate = true;
    for (let i = 0; i < this.kites.length; i++) {
      const k = this.kites[i]!;
      const wx = this.wrapX(k.ox, still ? 0 : time * k.speed * 4.5, 240);
      const wy = k.oy + Math.sin(time * 2.1 + k.phase) * 3.2 + Math.sin(time * 0.7 + k.phase * 2) * 1.5;
      dummy.position.set(camX + wx, wy + camY * 0.08, -44 - k.depth * 30);
      dummy.rotation.set(0.3, still ? 0 : time * 1.2 + k.phase, Math.sin(time * 3 + k.phase) * 0.5);
      dummy.scale.setScalar(k.scale);
      dummy.updateMatrix();
      this.kiteMesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHSL(k.hue, 0.85, 0.6);
      this.kiteMesh.setColorAt(i, tmpColor);
    }
    this.kiteMesh.instanceMatrix.needsUpdate = true;
    if (this.kiteMesh.instanceColor) this.kiteMesh.instanceColor.needsUpdate = true;
    for (let i = 0; i < this.lanterns.length; i++) {
      const l = this.lanterns[i]!;
      const wx = this.wrapX(l.ox, still ? 0 : time * l.speed * 1.6, 280);
      const rise = still ? 0 : ((time * 0.9 + l.phase * 4) % 14);
      dummy.position.set(camX + wx, l.oy + rise * 0.7 + camY * 0.04, -52 - l.depth * 34);
      dummy.rotation.set(0, 0, Math.sin(time + l.phase) * 0.1);
      dummy.scale.setScalar(l.scale * (1 - rise * 0.012));
      dummy.updateMatrix();
      this.lanternMesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHSL(l.hue, 0.95, 0.62 + Math.sin(time * 2 + l.phase) * 0.05);
      this.lanternMesh.setColorAt(i, tmpColor);
    }
    this.lanternMesh.instanceMatrix.needsUpdate = true;
    if (this.lanternMesh.instanceColor) this.lanternMesh.instanceColor.needsUpdate = true;
    if (!still) {
      this.shootT -= dt;
      if (this.shootT <= 0) {
        this.shootT = 6 + Math.random() * 9;
        const sp = this.shooters[Math.floor(Math.random() * this.shooters.length)]!;
        sp.position.set(camX + 40 + Math.random() * 60, camY + 42 + Math.random() * 22, -70);
        sp.rotation.z = -0.5;
        (sp.material as THREE.SpriteMaterial).opacity = 0.9;
        sp.userData.t = 0;
        sp.visible = true;
      }
    }
    for (const sp of this.shooters) {
      const u = sp.userData as { t: number; dur: number };
      if (!sp.visible) continue;
      u.t += dt;
      const k = u.t / u.dur;
      if (k >= 1) { sp.visible = false; continue; }
      sp.position.x -= dt * 90;
      sp.position.y -= dt * 34;
      (sp.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - k);
    }
  }

  private writeInstances(time: number): void {
    let idx = 0;
    for (let f = 0; f < this.flocks.length; f++) {
      const flock = this.flocks[f]!;
      const scale = 0.55 + flock.depth * 0.75;
      // aerial perspective: near = dark slate, far = pale sky-tinted
      tmpColor.setHSL(0.62, 0.12, 0.32 + (1 - flock.depth) * 0.34);

      // flock drifts leftward; wraps around the camera anchor
      const span = 240;
      let fx = flock.x - time * flock.speed * (2 + flock.depth * 3);
      fx = ((fx - this.anchorX + span * 0.5) % span + span) % span - span * 0.5;
      const fy = flock.y + Math.sin(time * 0.35 + flock.phase) * flock.wobble * 2;

      for (let b = 0; b < BIRDS_PER_FLOCK; b++) {
        // loose V-formation: two trailing arms behind the leader
        const row = Math.ceil(b / 2);
        const side = b === 0 ? 0 : b % 2 === 0 ? 1 : -1;
        const ox = b === 0 ? 0 : -row * 2.6 * scale;
        const oz = side * row * 2.2 * scale;
        const bob = Math.sin(time * 1.3 + flock.phase + b * 1.7) * 0.45;
        const bx = this.anchorX + fx + ox;
        const by = fy + bob;
        const bz = -40 - flock.depth * 38 + oz * 0.4;

        const flap = Math.sin(time * (4.5 + flock.depth * 2) + flock.phase + b * 0.9);
        const flapAngle = this.reducedMotion ? 0.25 : flap * 0.65;

        // body
        dummy.position.set(bx, by, bz);
        dummy.rotation.set(0, 0, flap * 0.06);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        this.bodyMesh.setMatrixAt(idx, dummy.matrix);
        this.bodyMesh.setColorAt(idx, tmpColor);

        // left wing (+z), flapping up
        dummy.rotation.set(-flapAngle, 0, 0);
        dummy.updateMatrix();
        this.wingL.setMatrixAt(idx, dummy.matrix);
        this.wingL.setColorAt(idx, tmpColor);

        // right wing (-z): mirror geometry via rotation around x by PI-flap
        dummy.rotation.set(Math.PI + flapAngle, 0, 0);
        dummy.updateMatrix();
        this.wingR.setMatrixAt(idx, dummy.matrix);
        this.wingR.setColorAt(idx, tmpColor);

        idx++;
      }
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.wingL.instanceMatrix.needsUpdate = true;
    this.wingR.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    if (this.wingL.instanceColor) this.wingL.instanceColor.needsUpdate = true;
    if (this.wingR.instanceColor) this.wingR.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.bodyGeo.dispose();
    this.wingGeo.dispose();
    this.birdMat.dispose();
    this.bodyMesh.dispose();
    this.wingL.dispose();
    this.wingR.dispose();
    this.cloudTex.dispose();
    for (const sp of this.clouds) sp.material.dispose();
    this.balloonMesh.geometry.dispose();
    (this.balloonMesh.material as THREE.Material).dispose();
    this.balloonMesh.dispose();
    this.kiteMesh.geometry.dispose();
    (this.kiteMesh.material as THREE.Material).dispose();
    this.kiteMesh.dispose();
    this.lanternMesh.geometry.dispose();
    (this.lanternMesh.material as THREE.Material).dispose();
    this.lanternMesh.dispose();
    for (const sp of this.shooters) sp.material.dispose();
  }
}

function makeCloudTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 128);
  const blobs: [number, number, number][] = [
    [108, 74, 46],
    [150, 66, 40],
    [78, 76, 34],
    [182, 80, 30],
    [128, 48, 32],
  ];
  for (const [x, y, r] of blobs) {
    const grd = g.createRadialGradient(x, y, 4, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,0.92)");
    grd.addColorStop(0.6, "rgba(255,255,255,0.5)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
