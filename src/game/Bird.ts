import * as THREE from "three";
import {
  AIR_DRAG_DIVE,
  AIR_DRAG_GLIDE,
  BIRD_RADIUS,
  BOOST_EXTRA_SPEED,
  GLIDE_LIFT_MAX,
  GLIDE_LIFT_SPEED,
  GRAVITY_DIVE,
  GRAVITY_GLIDE,
  GROUND_FRICTION,
  GROUND_FRICTION_DIVE,
  GROUND_G_DIVE,
  GROUND_G_GLIDE,
  LAND_BAD_MIN_KEEP,
  LAND_FEATHER_FLOOR,
  LAND_GOOD,
  LAND_GOOD_KEEP,
  LAND_PERFECT,
  LAND_PERFECT_GAIN,
  MAX_SPEED,
  MAX_SPEED_FEVER,
  MIN_KEEP_SPEED,
  OCEAN_FLOOR,
  STICK_ACCEL_DIVE,
  STICK_ACCEL_GLIDE,
  WATER_Y,
} from "./constants";
import { clamp, lerp, lerpAngle } from "./math";
import type { TerrainSystem } from "./TerrainSystem";

export type BirdStepOpts = {
  diving: boolean;
  fever: boolean;
  speedMult: number;
  boost: boolean;
  /** wing boost / golden wings — multiplies speed-borne lift */
  liftMult?: number;
  /** long glide — scales air drag down */
  dragMult?: number;
  /** feather — raises the floor on sloppy landings */
  feather?: boolean;
};

export type BirdSkinColors = {
  body: number;
  wing: number;
  belly: number;
  beak: number;
};

export class Bird {
  x = 50;
  y = 30;
  vx = 10;
  vy = 0;
  grounded = false;
  impact = 0;
  rotation = 0;
  asleep = false;
  inWater = false;
  justLanded = false;
  justLaunched = false;
  wasGrounded = false;
  /** 0..1 — how tangential the last touchdown was (1 = butter). */
  landingQuality = 1;
  /** Speed retained by the last touchdown, as a factor. */
  landingKeep = 1;
  /** Terrain slope and speed at the instant of the last take-off. */
  launchSlope = 0;
  launchSpeed = 0;
  /** Seconds airborne on the current flight, and the apex reached. */
  airTime = 0;
  apexY = 0;
  /** Height above the terrain directly below. */
  altitude = 0;

  readonly root = new THREE.Group();
  private readonly squash = new THREE.Group();
  private readonly wingL = new THREE.Group();
  private readonly wingR = new THREE.Group();
  private readonly wingTipL!: THREE.Mesh;
  private readonly wingTipR!: THREE.Mesh;
  private readonly membraneL!: THREE.Mesh;
  private readonly membraneR!: THREE.Mesh;
  private readonly feathersL: THREE.Mesh[] = [];
  private readonly feathersR: THREE.Mesh[] = [];
  private readonly lidL: THREE.Mesh;
  private readonly lidR: THREE.Mesh;
  private readonly pupilL: THREE.Mesh;
  private readonly pupilR: THREE.Mesh;
  private readonly beak: THREE.Mesh;
  private readonly tail: THREE.Mesh;
  private readonly glow: THREE.PointLight;
  private readonly shadow: THREE.Mesh;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly wingMat: THREE.MeshStandardMaterial;
  private readonly bellyMat: THREE.MeshStandardMaterial;
  private readonly lidMat: THREE.MeshStandardMaterial;
  private readonly beakMat: THREE.MeshStandardMaterial;

  private trailGlow: THREE.PointLight;
  private readonly _wingTipWorld = new THREE.Vector3();
  private flapT = 0;
  private squashAmt = 1;
  private stretchAmt = 1;
  private wingTuck = 0;
  private blink = 0;
  private glowPulse = 0;
  private wingFlutter = 0;

  constructor() {
    // PBR materials for better lighting response
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0xff7a45,
      roughness: 0.6,
      metalness: 0.0,
      emissive: 0xff7a45,
      emissiveIntensity: 0.15,
    });
    this.wingMat = new THREE.MeshStandardMaterial({
      color: 0xff9a62,
      roughness: 0.5,
      metalness: 0.0,
      emissive: 0xff9a62,
      emissiveIntensity: 0.1,
    });
    this.bellyMat = new THREE.MeshStandardMaterial({
      color: 0xffe6c4,
      roughness: 0.7,
      metalness: 0.0,
    });
    this.beakMat = new THREE.MeshStandardMaterial({
      color: 0xffc447,
      roughness: 0.4,
      metalness: 0.1,
      emissive: 0xffc447,
      emissiveIntensity: 0.2,
    });
    const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.0 });
    const eyeP = new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.1, metalness: 0.15 });
    this.lidMat = new THREE.MeshStandardMaterial({ color: 0xff7a45, roughness: 0.6, metalness: 0.0 });

    this.squash.add(this.makeBody());
    this.root.add(this.squash);

    this.lidL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), this.lidMat);
    this.lidR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), this.lidMat);
    this.lidL.position.set(0.42, 0.42, 0.38);
    this.lidR.position.set(0.42, 0.42, -0.38);
    this.lidL.scale.set(1, 0.08, 1);
    this.lidR.scale.set(1, 0.08, 1);
    this.squash.add(this.lidL, this.lidR);

    const eyeWhiteL = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 10), eyeW);
    const eyeWhiteR = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 10), eyeW);
    eyeWhiteL.position.set(0.40, 0.36, 0.38);
    eyeWhiteR.position.set(0.40, 0.36, -0.38);
    this.pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), eyeP);
    this.pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), eyeP);
    this.pupilL.position.set(0.10, 0.01, 0.04);
    this.pupilR.position.set(0.10, 0.01, -0.04);
    eyeWhiteL.add(this.pupilL);
    eyeWhiteR.add(this.pupilR);

    // Eye highlights — makes the bird feel alive
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const hlL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), hlMat);
    hlL.position.set(0.06, 0.05, 0.06);
    const hlR = hlL.clone();
    hlR.position.z = -0.02;
    this.pupilL.add(hlL);
    this.pupilR.add(hlR);

    this.squash.add(eyeWhiteL, eyeWhiteR);

    // Beak — slightly rounder for a friendlier look
    this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 8), this.beakMat);
    this.beak.rotation.z = -Math.PI / 2;
    this.beak.position.set(0.76, 0.16, 0);
    this.squash.add(this.beak);

    this.buildWing(this.wingL, 1);
    this.buildWing(this.wingR, -1);
    this.squash.add(this.wingL, this.wingR);

    // Tail — fan-shaped for better silhouette
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xdd5530,
      roughness: 0.5,
      metalness: 0,
    });
    this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.60, 6), tailMat);
    this.tail.rotation.z = Math.PI / 2.3;
    this.tail.position.set(-0.68, 0.06, 0);
    this.squash.add(this.tail);

    this.glow = new THREE.PointLight(0xffe08a, 0, 18, 2);
    this.glow.position.set(0, 0.4, 1);
    this.root.add(this.glow);

    // Trail glow for speed effect
    this.trailGlow = new THREE.PointLight(0xff8844, 0, 12, 1.5);
    this.trailGlow.position.set(-0.8, 0, 0);
    this.root.add(this.trailGlow);
    this.root.scale.setScalar(1.42);

    const shadowGeo = new THREE.CircleGeometry(1.1, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x1a1020,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;

    this.squash.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.root);
    scene.add(this.shadow);
  }

  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.root);
    scene.remove(this.shadow);
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 11;
    this.vy = 0;
    this.grounded = false;
    this.impact = 0;
    this.asleep = false;
    this.inWater = false;
    this.justLanded = false;
    this.justLaunched = false;
    this.wasGrounded = false;
    this.rotation = 0;
    this.squashAmt = 1;
    this.stretchAmt = 1;
    this.wingTuck = 0;
    this.flapT = 0;
    this.wingFlutter = 0;
    this.root.rotation.set(0, 0, 0);
    this.lidL.scale.y = 0.08;
    this.lidR.scale.y = 0.08;
  }

  speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  applySkin(skin: BirdSkinColors): void {
    this.bodyMat.color.setHex(skin.body);
    this.wingMat.color.setHex(skin.wing);
    this.bellyMat.color.setHex(skin.belly);
    this.lidMat.color.setHex(skin.body);
    this.beakMat.color.setHex(skin.beak);
  }

  /** Get world-space wing tip positions for feather trail / vortex particles. */
  getWingTips(): { x: number; y: number; z: number }[] {
    const tips: { x: number; y: number; z: number }[] = [];
    if (this.wingTipL) {
      this.wingTipL.getWorldPosition(this._wingTipWorld);
      tips.push({ x: this._wingTipWorld.x, y: this._wingTipWorld.y, z: this._wingTipWorld.z });
    }
    if (this.wingTipR) {
      this.wingTipR.getWorldPosition(this._wingTipWorld);
      tips.push({ x: this._wingTipWorld.x, y: this._wingTipWorld.y, z: this._wingTipWorld.z });
    }
    return tips;
  }

  /**
   * Momentum flight model.
   *
   * Grounded: the bird carves along the surface. Gravity resolved along the
   * tangent accelerates it downhill and bleeds speed uphill — that exchange
   * *is* the game. It leaves the ground only when the surface curves away
   * faster than the available downforce can hold it (a real ballistic launch
   * off a crest), which is why holding sticks you down and releasing flies.
   *
   * Airborne: pure ballistics plus quadratic drag, with speed-borne lift while
   * gliding. Nothing ever pushes the bird upward on its own.
   */
  step(dt: number, opts: BirdStepOpts, terrain: TerrainSystem): void {
    this.justLanded = false;
    this.justLaunched = false;
    this.impact = 0;
    const was = this.grounded;
    this.wasGrounded = was;

    const diving = opts.diving && !this.asleep;
    const cap =
      (opts.fever ? MAX_SPEED_FEVER : MAX_SPEED) * opts.speedMult + (opts.boost ? BOOST_EXTRA_SPEED : 0);

    if (was) {
      /* ---------- carving the surface ---------- */
      const n = terrain.normalAt(this.x);
      let vt = this.vx * n.tx + this.vy * n.ty;

      // gravity along the slope: downhill (ty<0) accelerates, uphill decelerates
      const gGround = diving ? GROUND_G_DIVE : GROUND_G_GLIDE;
      vt += -gGround * n.ty * dt;

      const fr = diving ? GROUND_FRICTION_DIVE : GROUND_FRICTION;
      vt *= 1 - fr * dt;

      if (vt < MIN_KEEP_SPEED) vt = lerp(vt, MIN_KEEP_SPEED, 1 - Math.pow(0.25, dt));
      if (vt > cap) vt = cap;

      this.vx = vt * n.tx;
      this.vy = vt * n.ty;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Follow the surface, then test whether it curves away from under us.
      const surf = terrain.heightAt(this.x) + BIRD_RADIUS;
      this.y = surf;
      const n2 = terrain.normalAt(this.x);
      const curv = terrain.curvatureAt(this.x); // >0 convex (crest), <0 concave (valley)
      let launched = false;
      if (curv > 0) {
        const needed = vt * vt * curv; // centripetal pull required to stay glued
        const available = (diving ? GRAVITY_DIVE : GRAVITY_GLIDE) * n2.ny + (diving ? STICK_ACCEL_DIVE : STICK_ACCEL_GLIDE);
        if (needed > available) launched = true;
      }
      if (launched) {
        this.grounded = false;
        this.justLaunched = true;
        this.launchSlope = terrain.slopeAt(this.x);
        this.launchSpeed = Math.abs(vt);
        this.airTime = 0;
        this.apexY = this.y;
        this.vx = vt * n2.tx;
        this.vy = vt * n2.ty;
      } else {
        this.grounded = true;
        this.vx = vt * n2.tx;
        this.vy = vt * n2.ty;
      }
    } else {
      /* ---------- ballistic flight ---------- */
      const sp = Math.max(0.001, this.speed());
      const lift = diving
        ? 0
        : Math.min(0.85, GLIDE_LIFT_MAX * clamp(sp / GLIDE_LIFT_SPEED, 0, 1) * (opts.liftMult ?? 1));
      this.vy -= (diving ? GRAVITY_DIVE : GRAVITY_GLIDE) * (1 - lift) * dt;

      const k = (diving ? AIR_DRAG_DIVE : AIR_DRAG_GLIDE) * (opts.dragMult ?? 1);
      const decay = Math.max(0, 1 - k * sp * dt);
      this.vx *= decay;
      this.vy *= decay;

      const s2 = this.speed();
      if (s2 > cap) {
        this.vx *= cap / s2;
        this.vy *= cap / s2;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      if (this.y > this.apexY) this.apexY = this.y;

      /* ---------- touchdown ---------- */
      const surf = terrain.heightAt(this.x) + BIRD_RADIUS;
      if (this.y <= surf) {
        const n = terrain.normalAt(this.x);
        const vn = this.vx * n.nx + this.vy * n.ny;
        let vt = this.vx * n.tx + this.vy * n.ty;
        const sp3 = Math.max(0.001, this.speed());

        // 1 = kissed the slope perfectly tangentially, 0 = slammed straight in
        const align = clamp(1 - Math.abs(vn) / sp3, 0, 1);
        this.landingQuality = align;
        // Tucking absorbs the impact — holding through a landing is how you
        // keep momentum, which is exactly the technique we want to teach.
        let floor = opts.feather ? LAND_FEATHER_FLOOR : LAND_BAD_MIN_KEEP;
        if (diving) floor = Math.max(floor, 0.86);
        let keep: number;
        if (align >= LAND_PERFECT) keep = LAND_PERFECT_GAIN;
        else if (align >= LAND_GOOD) keep = LAND_GOOD_KEEP;
        else keep = lerp(floor, LAND_GOOD_KEEP, clamp(align / LAND_GOOD, 0, 1));
        this.landingKeep = keep;

        this.impact = Math.max(0, -vn);
        vt = vt * keep;
        if (vt < MIN_KEEP_SPEED) vt = MIN_KEEP_SPEED;

        this.y = surf;
        this.grounded = true;
        this.justLanded = true;
        this.airTime = 0;
        this.vx = vt * n.tx;
        this.vy = vt * n.ty;
      }
    }

    const ocean = terrain.isOcean(this.x);
    this.inWater = ocean && this.y < WATER_Y + 0.6;
    if (this.inWater) {
      if (this.y < OCEAN_FLOOR + 2) this.y = OCEAN_FLOOR + 2;
      this.vy *= 0.55;
      this.vy += 38 * dt;
      this.vx *= 0.9;
      this.vx = Math.max(this.vx, 7);
      if (this.y > WATER_Y - 0.2 && this.vy > 0) {
        this.vy *= 0.4;
      }
    }

    if (this.asleep) {
      this.vx *= 0.9;
      if (this.grounded) this.vx *= 0.8;
    }

    // Hard floor: never let the bird visually clip below terrain
    const floorY = terrain.heightAt(this.x) + BIRD_RADIUS;
    if (this.y < floorY && !this.inWater) {
      this.y = floorY;
      if (this.vy < 0) this.vy = 0;
      this.grounded = true;
    }
    this.altitude = Math.max(0, this.y - terrain.heightAt(this.x) - BIRD_RADIUS);

    const targetAngle = this.grounded
      ? Math.atan(terrain.slopeAt(this.x))
      : clamp(Math.atan2(this.vy, Math.max(6, this.vx)), -1.15, 0.95) + (diving ? -0.12 : 0);
    // snappier on the ground so the bird reads as glued; softer in the air
    this.rotation = lerpAngle(this.rotation, targetAngle, 1 - Math.pow(this.grounded ? 0.0004 : 0.02, dt));
  }

  syncVisual(dt: number, diving: boolean, fever: boolean, time: number, terrain: TerrainSystem): void {
    const sp = this.speed();
    // 3D dynamic banking: subtle roll and pitch that gives true depth
    const bankX = Math.sin(time * 3.2) * 0.04 + clamp(this.vy * 0.012, -0.22, 0.22);
    const bankY = clamp(this.vx * 0.002, 0, 0.16) + (diving ? 0.06 : 0);
    this.root.position.set(this.x, this.y, 0);
    this.root.rotation.z = this.rotation * 0.92;
    this.root.rotation.x = bankX;
    this.root.rotation.y = bankY;

    // Pupil directional lookahead
    const pDx = clamp(this.vx * 0.0012, -0.01, 0.04);
    const pDy = clamp(this.vy * 0.002, -0.03, 0.03);
    this.pupilL.position.set(0.12 + pDx, 0.02 + pDy, 0.04);
    this.pupilR.position.set(0.12 + pDx, 0.02 + pDy, -0.04);

    // Beak opening on fast glides / high launches
    const beakOpen = clamp((sp - 35) / 55, 0, 0.35);
    this.beak.scale.set(1 + beakOpen * 0.2, 1 + beakOpen * 0.35, 1);

    // Tail wind flutter
    const tailFlutter = Math.sin(time * 24 + sp * 0.2) * 0.12 * clamp(sp / 40, 0.2, 1.2);
    this.tail.rotation.x = tailFlutter;

    this.flapT += dt * (diving ? 2 : 16 + sp * 0.08);
    this.wingTuck = lerp(this.wingTuck, diving || this.asleep ? 1 : 0, 1 - Math.pow(0.0008, dt));
    const flap = Math.sin(this.flapT) * 0.55 * (1 - this.wingTuck);

    // Wing twist during banking (rotation.y responds to vertical velocity)
    const bankTwist = clamp(this.vy * 0.018, -0.35, 0.35);

    // Wing stretch during dive (scale.z increases when diving fast)
    const diveStretch = diving ? 1 + clamp(sp * 0.004, 0, 0.25) : 1;

    // Wing flutter at high speed (rapid small oscillation)
    this.wingFlutter = sp > 60 ? Math.sin(time * 42) * 0.08 * clamp((sp - 60) / 50, 0, 1) : 0;

    // Wing droop when asleep
    const sleepDroop = this.asleep ? 0.3 : 0;

    this.wingL.rotation.z = lerp(0.15 + flap + this.wingFlutter, 1.15 + sleepDroop, this.wingTuck);
    this.wingR.rotation.z = lerp(-0.15 - flap - this.wingFlutter, -1.15 - sleepDroop, this.wingTuck);
    this.wingL.rotation.y = lerp(0.35 + bankTwist, 0.05, this.wingTuck);
    this.wingR.rotation.y = lerp(-0.35 - bankTwist, -0.05, this.wingTuck);

    // Wing stretch on the X axis for dive effect
    this.wingL.scale.z = lerp(0.5, diveStretch, this.wingTuck);
    this.wingR.scale.z = lerp(0.5, diveStretch, this.wingTuck);

    // Feather animation — subtle individual flutter
    for (let i = 0; i < this.feathersL.length; i++) {
      const fL = this.feathersL[i]!;
      const fR = this.feathersR[i]!;
      const featherWave = Math.sin(time * 18 + i * 2.5) * 0.12 * clamp(sp / 50, 0.2, 1);
      fL.rotation.x = featherWave;
      fR.rotation.x = -featherWave;
    }

    // Membrane responds to wind pressure
    if (this.membraneL && this.membraneR) {
      const memBulge = 0.3 + clamp(sp * 0.005, 0, 0.4);
      this.membraneL.scale.y = lerp(this.membraneL.scale.y, memBulge, 0.08);
      this.membraneR.scale.y = lerp(this.membraneR.scale.y, memBulge, 0.08);
      this.membraneL.rotation.z = -0.12 + bankTwist * 0.3;
      this.membraneR.rotation.z = -0.12 - bankTwist * 0.3;
    }

    if (this.justLanded && this.impact > 4) {
      this.squashAmt = clamp(1 - this.impact * 0.035, 0.55, 1);
      this.stretchAmt = 1 + (1 - this.squashAmt) * 0.8;
    }
    this.squashAmt = lerp(this.squashAmt, 1, 1 - Math.pow(0.002, dt));
    this.stretchAmt = lerp(this.stretchAmt, 1, 1 - Math.pow(0.002, dt));
    const speedStretch = 1 + clamp(this.speed() / 180, 0, 0.18);
    this.squash.scale.set(this.stretchAmt * speedStretch, this.squashAmt, 1);
    this.squash.rotation.x = Math.sin(time * 3.2) * 0.04;

    if (this.asleep) {
      this.lidL.scale.y = lerp(this.lidL.scale.y, 1, 0.12);
      this.lidR.scale.y = lerp(this.lidR.scale.y, 1, 0.12);
    } else {
      this.blink -= dt;
      if (this.blink < 0) this.blink = 2.2 + Math.random() * 2.5;
      const closed = this.blink < 0.12 ? 0.9 : 0.08;
      this.lidL.scale.y = lerp(this.lidL.scale.y, closed, 0.4);
      this.lidR.scale.y = lerp(this.lidR.scale.y, closed, 0.4);
    }

    this.glowPulse += dt * 6;
    this.glow.intensity = fever ? 2.6 + Math.sin(this.glowPulse) * 0.9 : 0.55;
    this.glow.color.setHex(fever ? 0xffe08a : 0xfff4dc);
    this.bodyMat.emissive.set(fever ? 0x552200 : 0x221108);
    this.wingMat.emissive.set(fever ? 0x441800 : 0x000000);
    this.bellyMat.emissive.set(fever ? 0x332200 : 0x000000);

    const h = terrain.heightAt(this.x);
    const alt = Math.max(0, this.y - h);
    this.shadow.position.set(this.x, h + 0.08, 0);
    const s = clamp(1.3 - alt * 0.045, 0.25, 1.3);
    this.shadow.scale.setScalar(s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.28 * s * (this.inWater ? 0.15 : 1);
  }

  dispose(): void {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
  }

  private makeBody(): THREE.Mesh {
    // Main body — rounder, cuter proportions
    const geo = new THREE.SphereGeometry(0.58, 16, 12);
    const body = new THREE.Mesh(geo, this.bodyMat);
    body.scale.set(1.18, 0.88, 0.88);

    // Belly — warmer, softer curve
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.40, 14, 10), this.bellyMat);
    belly.position.set(0.06, -0.16, 0);
    belly.scale.set(1.08, 0.78, 0.88);
    body.add(belly);

    // Cheek blush — adds warmth and cuteness
    const blushMat = new THREE.MeshStandardMaterial({
      color: 0xff9a80,
      roughness: 0.8,
      metalness: 0,
      transparent: true,
      opacity: 0.45,
    });
    const blushL = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), blushMat);
    blushL.position.set(0.32, 0.05, 0.40);
    blushL.scale.set(1, 0.6, 0.5);
    const blushR = blushL.clone();
    blushR.position.z = -0.40;
    body.add(blushL, blushR);

    return body;
  }

  private buildWing(group: THREE.Group, side: number): void {
    // Main wing surface — elongated for better silhouette
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 8), this.wingMat);
    wing.scale.set(1.05, 0.22, 0.58);
    group.add(wing);

    // Wing tip — distinct darker color for character
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xdd6030,
      roughness: 0.4,
      metalness: 0.05,
      emissive: 0xdd6030,
      emissiveIntensity: 0.08,
    });
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 6), tipMat);
    tip.position.set(-0.34, 0.02, 0);
    tip.scale.set(0.75, 0.45, 0.55);
    group.add(tip);
    if (side === 1) {
      (this as unknown as { wingTipL: THREE.Mesh }).wingTipL = tip;
    } else {
      (this as unknown as { wingTipR: THREE.Mesh }).wingTipR = tip;
    }

    // Wing membrane — thin translucent plane between segments for light catch
    const memMat = new THREE.MeshStandardMaterial({
      color: 0xffb88a,
      roughness: 0.6,
      metalness: 0.0,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      emissive: 0xff9966,
      emissiveIntensity: 0.06,
    });
    const memGeo = new THREE.PlaneGeometry(0.55, 0.28, 1, 1);
    const mem = new THREE.Mesh(memGeo, memMat);
    mem.position.set(-0.15, -0.04, 0.02 * side);
    mem.rotation.x = 0.15 * side;
    mem.rotation.z = -0.12;
    group.add(mem);
    if (side === 1) {
      (this as unknown as { membraneL: THREE.Mesh }).membraneL = mem;
    } else {
      (this as unknown as { membraneR: THREE.Mesh }).membraneR = mem;
    }

    // Feather details — 3 small triangular planes along trailing edge
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0xe87755,
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const feathersArr = side === 1 ? this.feathersL : this.feathersR;
    for (let i = 0; i < 3; i++) {
      const featherGeo = new THREE.ConeGeometry(0.06, 0.18, 3);
      const feather = new THREE.Mesh(featherGeo, featherMat);
      feather.position.set(-0.08 + i * 0.14, -0.08, 0.22 * side);
      feather.rotation.z = Math.PI / 2 + 0.3;
      feather.rotation.x = i * 0.15 * side;
      feather.scale.set(0.8, 0.8, 0.5);
      group.add(feather);
      feathersArr.push(feather);
    }

    group.position.set(-0.08, 0.14, 0.44 * side);
    group.rotation.y = 0.35 * side;
  }
}
