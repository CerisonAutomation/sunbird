import * as THREE from "three";
import { ALT_CLOUDS, ALT_HIGH, ALT_SKY, CAMERA_BASE_Z, CAMERA_LOOKAHEAD, MAX_SPEED } from "./constants";
import { clamp, smoothstep } from "./math";
import type { Bird } from "./Bird";

/**
 * Dynamic chase camera.
 *
 * Close and low while carving, pulled back as speed builds, and lifted right
 * out into the sky on a big launch so the player can see how high they got.
 * Everything is critically damped — the camera never snaps.
 */
// Critically-damped spring: stiffness k=(2π·freq)² , damping d=2·ζ·√k
const SPRING_FREQ = 5.2;   // Hz — snappy but not jittery
const SPRING_DAMP = 0.72;  // ζ — slightly overdamped, no oscillation
const SPRING_K    = (2 * Math.PI * SPRING_FREQ) ** 2;
const SPRING_D    = 2 * SPRING_DAMP * Math.sqrt(SPRING_K);

function springStep(pos: number, vel: number, target: number, dt: number): [number, number] {
  const f = -SPRING_K * (pos - target) - SPRING_D * vel;
  const newVel = vel + f * dt;
  const newPos = pos + newVel * dt;
  return [newPos, newVel];
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private lookX = 50; private lookVX = 0;
  private lookY = 20; private lookVY = 0;
  private camX = 40;  private camVX = 0;
  private camY = 24;  private camVY = 0;
  private camZ = CAMERA_BASE_Z; private camVZ = 0;
  private fov = 50;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private intro = 1;
  private punchZ = 0;
  private reduceMotion = false;
  private baseFov = 50;
  /** Vignette intensity driven by speed (>80% max). Read by PostProcessing. */
  vignetteIntensity = 0.22; // base vignette from color grading

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

    const ahead = 8 + speed * CAMERA_LOOKAHEAD + altPull * 0.12;
    const targetLookX = bird.x + ahead;
    // Look upward when bird is at low-to-mid altitude — gives sky in frame.
    // When very high, bias downward so landscape stays visible.
    const downBias = smoothstep(ALT_SKY, ALT_HIGH, alt) * 14;
    const upBias = smoothstep(0, 30, alt) * 5;  // tilt up as bird rises from ground
    const targetLookY = bird.y + 7 + upBias - downBias;

    // Rising fast? Lead the climb. Falling from height? Lead the descent.
    const vLead = clamp(bird.vy * 0.12, -14, 18) * smoothstep(6, 40, alt);

    // Spring-based camera — organic feel with critical damping (no lerp snap)
    const springDt = Math.min(dt, 0.05); // cap sub-step to avoid instability
    ;[this.lookX, this.lookVX] = springStep(this.lookX, this.lookVX, targetLookX, springDt);
    ;[this.lookY, this.lookVY] = springStep(this.lookY, this.lookVY, targetLookY + vLead * 0.35, springDt);

    this.punchZ *= Math.pow(0.03, dt);
    const zoom = CAMERA_BASE_Z + sNorm * 14 + altPull - this.punchZ;

    const wantY = bird.y + 9 + altPull * 0.18 + vLead;
    const floorY = groundY + 5;

    ;[this.camX, this.camVX] = springStep(this.camX, this.camVX, bird.x - 1.5 + this.intro * 6, springDt);
    ;[this.camY, this.camVY] = springStep(this.camY, this.camVY, Math.max(floorY, wantY) + this.intro * 4, springDt);
    ;[this.camZ, this.camVZ] = springStep(this.camZ, this.camVZ, zoom + this.intro * 10, springDt);

    // Dynamic FOV expands from 50° up to 70° at supersonic speeds for an intense rush!
    let targetFov = this.baseFov + sNorm * (this.reduceMotion ? 4 : 18);
    // High-speed focus zoom: at >80% max, narrow FOV 3-5° for tunnel-vision intensity
    if (sNorm > 0.8 && !this.reduceMotion) {
      const focusZoom = (sNorm - 0.8) / 0.4; // 0..1 above 80%
      targetFov -= Math.min(focusZoom, 1) * 5;
    }
    // Speed-based vignette: intensifies above 80% max speed
    if (sNorm > 0.8 && !this.reduceMotion) {
      const vigT = (sNorm - 0.8) / 0.4;
      this.vignetteIntensity = 0.22 + Math.min(vigT, 1) * 0.35;
    } else {
      this.vignetteIntensity = 0.22;
    }
    this.fov = lerp(this.fov, targetFov, 1 - Math.pow(0.06, dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.shake *= Math.pow(0.04, dt);
    this.shakeX = (Math.random() - 0.5) * this.shake;
    this.shakeY = (Math.random() - 0.5) * this.shake;
    this.apply();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private apply(): void {
    this.camera.position.set(this.camX + this.shakeX, this.camY + this.shakeY, this.camZ);
    this.camera.lookAt(this.lookX, this.lookY, 0);
    this.camera.rotation.z = this.shakeX * 0.01;
  }
}
