/**
 * Local 2-player multiplayer system.
 * Supports split-screen and versus mode with shared terrain.
 */

import * as THREE from "three";
import { Bird } from "./Bird";
import { TerrainSystem } from "./TerrainSystem";
import { CameraRig } from "./CameraRig";

export type PlayerState = {
  bird: Bird;
  camera: CameraRig;
  x: number;
  y: number;
  vx: number;
  vy: number;
  distance: number;
  coins: number;
  score: number;
  alive: boolean;
  finished: boolean;
  finishTime: number;
};

export class Multiplayer {
  readonly p1: PlayerState;
  readonly p2: PlayerState;
  private splitMode: "off" | "vertical" | "horizontal" = "off";

  constructor(_terrain: TerrainSystem, _seedN: number) {
    // Player 1
    const bird1 = new Bird();
    const cam1 = new CameraRig(1);
    this.p1 = {
      bird: bird1,
      camera: cam1,
      x: 50,
      y: 30,
      vx: 11,
      vy: 0,
      distance: 0,
      coins: 0,
      score: 0,
      alive: true,
      finished: false,
      finishTime: 0,
    };

    // Player 2
    const bird2 = new Bird();
    bird2.applySkin({ body: 0x4a9eff, wing: 0x6ab4ff, belly: 0xc4e0ff, beak: 0xffc447 });
    const cam2 = new CameraRig(1);
    this.p2 = {
      bird: bird2,
      camera: cam2,
      x: 50,
      y: 30,
      vx: 11,
      vy: 0,
      distance: 0,
      coins: 0,
      score: 0,
      alive: true,
      finished: false,
      finishTime: 0,
    };
  }

  /** Set split screen orientation based on aspect ratio */
  setSplitMode(mode: "off" | "vertical" | "horizontal"): void {
    this.splitMode = mode;
  }

  /** Get viewport rectangles for each player */
  getViewports(width: number, height: number): { p1: THREE.Vector4; p2: THREE.Vector4 } {
    if (this.splitMode === "vertical") {
      return {
        p1: new THREE.Vector4(0, 0, width / 2, height),
        p2: new THREE.Vector4(width / 2, 0, width / 2, height),
      };
    }
    if (this.splitMode === "horizontal") {
      return {
        p1: new THREE.Vector4(0, height / 2, width, height / 2),
        p2: new THREE.Vector4(0, 0, width, height / 2),
      };
    }
    // No split — both share viewport (for versus overlay)
    return {
      p1: new THREE.Vector4(0, 0, width, height),
      p2: new THREE.Vector4(0, 0, width, height),
    };
  }

  /** Update both players */
  step(
    dt: number,
    terrain: TerrainSystem,
    input1: { diving: boolean; fever: boolean; speedMult: number; boost: boolean },
    input2: { diving: boolean; fever: boolean; speedMult: number; boost: boolean },
  ): void {
    if (this.p1.alive && !this.p1.finished) {
      this.p1.bird.step(dt, input1, terrain);
      this.p1.x = this.p1.bird.x;
      this.p1.y = this.p1.bird.y;
      this.p1.vx = this.p1.bird.vx;
      this.p1.vy = this.p1.bird.vy;
      this.p1.distance = Math.max(0, this.p1.x - 50);
    }

    if (this.p2.alive && !this.p2.finished) {
      this.p2.bird.step(dt, input2, terrain);
      this.p2.x = this.p2.bird.x;
      this.p2.y = this.p2.bird.y;
      this.p2.vx = this.p2.bird.vx;
      this.p2.vy = this.p2.bird.vy;
      this.p2.distance = Math.max(0, this.p2.x - 50);
    }
  }

  /** Check if either player has passed the finish line */
  checkFinish(finishDistance: number): number | null {
    if (!this.p1.finished && this.p1.distance >= finishDistance) {
      this.p1.finished = true;
      this.p1.finishTime = performance.now();
      return 1;
    }
    if (!this.p2.finished && this.p2.distance >= finishDistance) {
      this.p2.finished = true;
      this.p2.finishTime = performance.now();
      return 2;
    }
    return null;
  }

  /** Get winner (0 = draw, 1 = p1, 2 = p2) */
  getWinner(): number {
    if (this.p1.finished && this.p2.finished) {
      return this.p1.finishTime < this.p2.finishTime ? 1 : 2;
    }
    if (this.p1.finished) return 1;
    if (this.p2.finished) return 2;
    // Highest distance wins if both alive
    if (this.p1.distance > this.p2.distance) return 1;
    if (this.p2.distance > this.p1.distance) return 2;
    return 0; // draw
  }

  /** Reset both players */
  reset(startX: number): void {
    this.p1.bird.reset(startX, 30);
    this.p2.bird.reset(startX, 30);
    this.p1.x = startX;
    this.p1.y = 30;
    this.p2.x = startX;
    this.p2.y = 30;
    this.p1.distance = 0;
    this.p2.distance = 0;
    this.p1.coins = 0;
    this.p2.coins = 0;
    this.p1.score = 0;
    this.p2.score = 0;
    this.p1.alive = true;
    this.p2.alive = true;
    this.p1.finished = false;
    this.p2.finished = false;
  }

  /** Add both birds to scene */
  addTo(scene: THREE.Scene): void {
    this.p1.bird.addTo(scene);
    this.p2.bird.addTo(scene);
  }

  /** Remove from scene */
  dispose(scene: THREE.Scene): void {
    scene.remove(this.p1.bird.root);
    scene.remove(this.p2.bird.root);
    this.p1.bird.removeFromScene(scene);
    this.p2.bird.removeFromScene(scene);
  }
}
