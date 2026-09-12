import * as THREE from "three";
import { ALT_CLOUDS, ALT_HIGH, ALT_SKY, CAMERA_BASE_Z, CAMERA_LOOKAHEAD, MAX_SPEED } from "./constants";
import { clamp, lerp, smoothstep } from "./math";
import type { Bird } from "./Bird";

/**
 * Dynamic chase camera.
 *
 * Close and low while carving, pulled back as speed builds, and lifted right
 * out into the sky on a big launch so the player can see how high they got.
 * Everything is critically damped — the camera never snaps.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private lookX = 50;
  private lookY = 20;
  private camX = 40;
  private camY = 24;
  private camZ = CAMERA_BASE_Z;
  private fov = 50;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private intro = 1;
  private punchZ = 0;
  private reduceMotion = false;
  private baseFov = 50;
  /** Cinematic layer: dolly-zoom on launches + settling roll. */
  private dolly = 0;
  private dollyVel = 0;
  private rollTilt = 0;
  private orbit = 0;
  private orbitTarget = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1400);
    this.camera.position.set(40, 26, CAMERA_BASE_Z);
  }

  /** Split-screen viewports are short and wide; widen the lens to compensate. */
  setBaseFov(fov: number): void {
    this.baseFov = fov;
  }

  setIntro(v: number): void {
    this.intro = v;
  }

  setReduceMotion(v: boolean): void {
    this.reduceMotion = v;
    if (v) this.shake = 0;
  }

  bump(amount: number): void {
    if (this.reduceMotion) return;
    this.shake = Math.min(2.2, this.shake + amount);
  }

  punch(amount: number): void {
    this.punchZ = Math.max(this.punchZ, this.reduceMotion ? amount * 0.4 : amount);
  }

  /**
   * Cinematic dolly-zoom: the rig pulls back while the lens narrows, so the
   * bird stays the same on-screen size but the world warps behind it. Fired on
   * a perfect launch — the single most cinematic beat in the game.
   */
  dollyZoom(strength: number): void {
    if (this.reduceMotion) return;
    this.dollyVel += strength;
  }

  /** A brief banked camera roll used when a big launch fires. */
  tilt(amount: number): void {
    if (this.reduceMotion) return;
    this.orbitTarget = clamp(amount, -0.32, 0.32);
  }

  snapTo(bird: Bird): void {
    this.lookX = bird.x + 10;
    this.lookY = bird.y + 5;
    this.camX = bird.x - 2;
    this.camY = bird.y + 8;
    this.camZ = CAMERA_BASE_Z;
    this.shake = 0;
    this.punchZ = 0;
    this.intro = 0;
    this.apply();
  }

  update(dt: number, bird: Bird, playing: boolean, groundY = 0): void {
    const speed = bird.speed();
    const sNorm = clamp(speed / MAX_SPEED, 0, 1.2);
    const alt = bird.altitude;

    // How far out we frame: speed pulls back a little, altitude a lot.
    const altPull =
      smoothstep(ALT_SKY * 0.5, ALT_SKY, alt) * 12 +
      smoothstep(ALT_SKY, ALT_CLOUDS, alt) * 22 +
      smoothstep(ALT_CLOUDS, ALT_HIGH, alt) * 34 +
      smoothstep(ALT_HIGH, ALT_HIGH * 2.2, alt) * 46;

    // A touch more lookahead keeps the bird in the left third of the frame so
    // the player reads the hills ahead, not the bird's back.
    const ahead = 9.5 + speed * CAMERA_LOOKAHEAD + altPull * 0.12;
    const targetLookX = bird.x + ahead;
    // When very high, bias the look point downward so the landscape stays in frame.
    const downBias = smoothstep(ALT_SKY, ALT_HIGH, alt) * 14;
    // Slightly lower look point + higher camera = a gentle top-down tilt: the
    // bird frames against the ground (readable landings) instead of the sky.
    const targetLookY = bird.y + 3.2 - downBias;

    // Rising fast? Lead the climb. Falling from height? Lead the descent.
    const vLead = clamp(bird.vy * 0.12, -14, 18) * smoothstep(6, 40, alt);

    const k = 1 - Math.pow(playing ? 0.006 : 0.05, dt);
    const kSlow = 1 - Math.pow(playing ? 0.02 : 0.05, dt);
    this.lookX = lerp(this.lookX, targetLookX, k);
    this.lookY = lerp(this.lookY, targetLookY + vLead * 0.35, kSlow);

    // Spring-damped dolly: overshoots outward, then eases home.
    this.dollyVel += -this.dolly * 34 * dt;
    this.dollyVel *= Math.pow(0.02, dt);
    this.dolly += this.dollyVel * dt;

    this.punchZ *= Math.pow(0.03, dt);
    const zoom = CAMERA_BASE_Z + sNorm * 14 + altPull - this.punchZ + this.dolly * 5;

    // Keep the ground on screen when we are miles up, but never below it.
    // Camera rides a little higher so the bird frames against the terrain
    // rather than tree canopies at low altitude.
    const wantY = bird.y + 8.5 + altPull * 0.16 + vLead;
    const floorY = groundY + 6.5;

    this.camX = lerp(this.camX, bird.x - 1.5 + this.intro * 6, k);
    this.camY = lerp(this.camY, Math.max(floorY, wantY) + this.intro * 4, kSlow);
    this.camZ = lerp(this.camZ, zoom + this.intro * 10, Math.min(1, kSlow * 1.4));

    // Banked roll settles back to level so the horizon never stays crooked.
    this.orbitTarget = lerp(this.orbitTarget, 0, 1 - Math.pow(0.08, dt));
    this.orbit = lerp(this.orbit, this.orbitTarget, 1 - Math.pow(0.02, dt));
    // Airborne pitch reads as the bird "hanging" at apex.
    this.rollTilt = lerp(this.rollTilt, clamp(-bird.vy * 0.004, -0.09, 0.09), 1 - Math.pow(0.05, dt));

    // Dynamic FOV: widens with speed, and counter-narrows during a dolly-zoom
    // so the subject holds size while the background stretches.
    const targetFov = this.baseFov + sNorm * (this.reduceMotion ? 4 : 18) - this.dolly * 9;
    this.fov = lerp(this.fov, targetFov, 1 - Math.pow(0.06, dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.shake *= Math.pow(0.04, dt);
    // Sine-sum shake for organic, non-repeating motion instead of random jitter.
    const t = performance.now() * 0.001;
    this.shakeX = (Math.sin(t * 23.7) * 0.7 + Math.sin(t * 31.3) * 0.3) * this.shake;
    this.shakeY = (Math.cos(t * 29.1) * 0.7 + Math.cos(t * 37.9) * 0.3) * this.shake;
    this.apply();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private apply(): void {
    this.camera.position.set(this.camX + this.shakeX, this.camY + this.shakeY, this.camZ);
    this.camera.lookAt(this.lookX, this.lookY, 0);
    this.camera.rotation.z = this.shakeX * 0.01 + this.orbit;
    this.camera.rotation.x += this.rollTilt;
  }
}
