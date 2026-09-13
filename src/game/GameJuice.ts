/**
 * Game Juice System - Enhanced Feedback for Actions
 * 
 * Provides satisfying feedback for:
 * - Perfect landings (screen shake, particles, sound)
 * - Launch moments (directional particles, speed lines)
 * - Speed visualization (FOV change, motion blur)
 * - Achievement celebrations (visual effects)
 */

import * as THREE from "three";

export class GameJuice {
  readonly group = new THREE.Group();

  // Screen shake
  private shakeIntensity = 0;
  private shakeDecay = 0.9;
  private shakeOffset = new THREE.Vector3();

  // Screen flash overlay
  private flashOverlay: THREE.Mesh;
  private flashTimer = 0;
  private flashDuration = 0;

  // Speed lines
  private speedLines: THREE.Mesh[] = [];
  private speedLineMaterial: THREE.MeshBasicMaterial;

  // FOV effect
  private targetFov = 60;
  private currentFov = 60;

  // Combo pulse
  readonly comboPulseMesh: THREE.Mesh;
  private comboPulseTime = 0;

  // Zenith ring
  readonly zenithRingMesh: THREE.Mesh;
  private zenithRingTime = 0;

  // Launch burst
  readonly launchBurstPoints: THREE.Points;
  private launchBurstPositions: Float32Array;
  private launchBurstVelocities: Float32Array;
  private launchBurstLife: Float32Array;
  private launchBurstCursor = 0;
  
  constructor() {
    // Screen flash overlay — attached to camera later
    const flashGeo = new THREE.PlaneGeometry(200, 200);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.flashOverlay = new THREE.Mesh(flashGeo, flashMat);
    this.flashOverlay.renderOrder = 999;
    this.flashOverlay.visible = false;

    // Create speed lines
    const speedLineGeo = new THREE.PlaneGeometry(0.1, 2);
    this.speedLineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    
    for (let i = 0; i < 20; i++) {
      const line = new THREE.Mesh(speedLineGeo, this.speedLineMaterial.clone());
      line.visible = false;
      this.speedLines.push(line);
      this.group.add(line);
    }
    
    // Combo pulse mesh
    const comboGeo = new THREE.RingGeometry(0.5, 0.7, 32);
    const comboMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.comboPulseMesh = new THREE.Mesh(comboGeo, comboMat);
    this.comboPulseMesh.visible = false;
    this.group.add(this.comboPulseMesh);
    
    // Zenith ring mesh
    const zenithGeo = new THREE.RingGeometry(1, 1.2, 32);
    const zenithMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.zenithRingMesh = new THREE.Mesh(zenithGeo, zenithMat);
    this.zenithRingMesh.visible = false;
    this.group.add(this.zenithRingMesh);
    
    // Launch burst particles
    const burstCount = 90;
    this.launchBurstPositions = new Float32Array(burstCount * 3);
    this.launchBurstVelocities = new Float32Array(burstCount * 3);
    this.launchBurstLife = new Float32Array(burstCount);
    
    const burstGeo = new THREE.BufferGeometry();
    burstGeo.setAttribute('position', new THREE.BufferAttribute(this.launchBurstPositions, 3));
    
    const burstMat = new THREE.PointsMaterial({
      color: 0xffd700,
      size: 0.55,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    
    this.launchBurstPoints = new THREE.Points(burstGeo, burstMat);
    this.launchBurstPoints.visible = false;
    this.group.add(this.launchBurstPoints);
  }

  /** Trigger screen shake */
  shake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  /** Trigger FOV change */
  setFov(fov: number): void {
    this.targetFov = fov;
  }

  /** Trigger combo pulse effect */
  comboPulse(combo: number): void {
    this.comboPulseTime = 1;
    this.comboPulseMesh.visible = true;
    this.comboPulseMesh.scale.setScalar(1 + combo * 0.1);
    (this.comboPulseMesh.material as THREE.MeshBasicMaterial).opacity = 0.8;
  }

  /** Trigger zenith ring effect */
  zenithRing(_x?: number, _y?: number): void {
    this.zenithRingTime = 1;
    this.zenithRingMesh.visible = true;
    this.zenithRingMesh.scale.setScalar(1);
    (this.zenithRingMesh.material as THREE.MeshBasicMaterial).opacity = 0.8;
  }

  /** Trigger near miss flash effect */
  nearMissFlash(): void {
    // Visual feedback for near miss - brief screen flash
    this.shakeIntensity = Math.max(this.shakeIntensity, 0.1);
  }

  /** Trigger combo pop effect */
  comboPop(): void {
    this.comboPulseTime = 1;
    this.comboPulseMesh.visible = true;
    this.comboPulseMesh.scale.setScalar(1.5);
    (this.comboPulseMesh.material as THREE.MeshBasicMaterial).opacity = 1.0;
  }

  /** Trigger hit stop effect */
  hitStop(_duration: number): void {
    // Brief pause for satisfying feedback - implemented via time scale in game loop
  }

  /** Trigger screen flash effect — color, peak opacity (0-1), duration in seconds */
  flash(color: number, peakOpacity = 0.5, duration = 0.15): void {
    (this.flashOverlay.material as THREE.MeshBasicMaterial).color.setHex(color);
    (this.flashOverlay.material as THREE.MeshBasicMaterial).opacity = peakOpacity;
    this.flashOverlay.visible = true;
    this.flashTimer = 0;
    this.flashDuration = duration;
  }

  /** Attach flash overlay to camera so it stays screen-fixed */
  attachToCamera(camera: THREE.Camera): void {
    camera.add(this.flashOverlay);
    this.flashOverlay.position.set(0, 0, -1);
  }

  /** Trigger launch burst particles */
  launchBurst(x: number, y: number, dirX: number, dirY: number): void {
    this.launchBurstPoints.visible = true;
    const count = 18;
    const baseAngle = Math.atan2(dirY, dirX);

    for (let i = 0; i < count; i++) {
      const idx = (this.launchBurstCursor + i) % 90;
      this.launchBurstPositions[idx * 3] = x;
      this.launchBurstPositions[idx * 3 + 1] = y;
      this.launchBurstPositions[idx * 3 + 2] = 0;

      const angle = baseAngle + (Math.random() - 0.5) * 2.2;
      const speed = 12 + Math.random() * 28;
      this.launchBurstVelocities[idx * 3] = Math.cos(angle) * speed;
      this.launchBurstVelocities[idx * 3 + 1] = Math.sin(angle) * speed;
      this.launchBurstVelocities[idx * 3 + 2] = 0;

      this.launchBurstLife[idx] = 1;
    }

    this.launchBurstCursor = (this.launchBurstCursor + count) % 90;
    this.launchBurstPoints.geometry.attributes.position.needsUpdate = true;
  }

  /** Update all juice effects */
  update(dt: number, birdX?: number, birdY?: number, birdSpeed?: number, camera?: THREE.PerspectiveCamera): number {
    // Screen shake
    if (this.shakeIntensity > 0.01) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity * 2,
        (Math.random() - 0.5) * this.shakeIntensity * 2,
        0,
      );
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeOffset.set(0, 0, 0);
      this.shakeIntensity = 0;
    }

    // FOV effect
    if (camera) {
      this.currentFov = THREE.MathUtils.lerp(this.currentFov, this.targetFov, 0.1);
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }

    // Speed lines
    const showSpeedLines = (birdSpeed ?? 0) > 60;
    for (let i = 0; i < this.speedLines.length; i++) {
      const line = this.speedLines[i]!;
      if (showSpeedLines && birdX !== undefined && birdY !== undefined) {
        line.visible = true;
        const angle = (i / this.speedLines.length) * Math.PI * 2;
        const radius = 15 + Math.sin(i * 1.7) * 5;
        line.position.set(
          birdX + Math.cos(angle) * radius,
          birdY + Math.sin(angle) * radius,
          0,
        );
        line.rotation.z = angle;
        (line.material as THREE.MeshBasicMaterial).opacity = 0.1 + ((birdSpeed ?? 0) - 60) / 100 * 0.2;
      } else {
        line.visible = false;
      }
    }

    // Combo pulse
    if (this.comboPulseTime > 0) {
      this.comboPulseTime -= dt * 2;
      this.comboPulseMesh.scale.setScalar(1 + (1 - this.comboPulseTime) * 2);
      (this.comboPulseMesh.material as THREE.MeshBasicMaterial).opacity = this.comboPulseTime * 0.8;
      if (birdX !== undefined && birdY !== undefined) {
        this.comboPulseMesh.position.set(birdX, birdY, 0);
      }
      if (this.comboPulseTime <= 0) {
        this.comboPulseMesh.visible = false;
      }
    }
    
    // Zenith ring
    if (this.zenithRingTime > 0) {
      this.zenithRingTime -= dt;
      this.zenithRingMesh.scale.setScalar(1 + (1 - this.zenithRingTime) * 3);
      (this.zenithRingMesh.material as THREE.MeshBasicMaterial).opacity = this.zenithRingTime * 0.8;
      if (birdX !== undefined && birdY !== undefined) {
        this.zenithRingMesh.position.set(birdX, birdY, 0);
      }
      if (this.zenithRingTime <= 0) {
        this.zenithRingMesh.visible = false;
      }
    }
    
    // Launch burst
    if (this.launchBurstPoints.visible) {
      let anyAlive = false;
      for (let i = 0; i < 90; i++) {
        if (this.launchBurstLife[i] > 0) {
          anyAlive = true;
          this.launchBurstLife[i] -= dt * 2;
          this.launchBurstPositions[i * 3] += this.launchBurstVelocities[i * 3] * dt;
          this.launchBurstPositions[i * 3 + 1] += this.launchBurstVelocities[i * 3 + 1] * dt;
          this.launchBurstVelocities[i * 3 + 1] -= 20 * dt; // gravity
        }
      }
      this.launchBurstPoints.geometry.attributes.position.needsUpdate = true;
      if (!anyAlive) {
        this.launchBurstPoints.visible = false;
      }
    }

    // Screen flash — fast attack, exponential decay
    if (this.flashOverlay.visible) {
      this.flashTimer += dt;
      const t = this.flashTimer / this.flashDuration;
      const mat = this.flashOverlay.material as THREE.MeshBasicMaterial;
      if (t >= 1) {
        mat.opacity = 0;
        this.flashOverlay.visible = false;
      } else {
        mat.opacity *= Math.pow(0.02, dt);
      }
    }

    return 1; // Default time scale
  }

  /** Get screen shake offset */
  getShakeOffset(): THREE.Vector3 {
    return this.shakeOffset;
  }

  /** Dispose */
  dispose(): void {
    this.speedLines.forEach(line => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    this.comboPulseMesh.geometry.dispose();
    (this.comboPulseMesh.material as THREE.Material).dispose();
    this.zenithRingMesh.geometry.dispose();
    (this.zenithRingMesh.material as THREE.Material).dispose();
    this.launchBurstPoints.geometry.dispose();
    (this.launchBurstPoints.material as THREE.Material).dispose();
  }
}

export default GameJuice;
