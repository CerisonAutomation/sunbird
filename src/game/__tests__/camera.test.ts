import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CameraRig } from "../CameraRig";
import { Bird } from "../Bird";
import { TerrainSystem } from "../TerrainSystem";

/**
 * Camera feel invariants (prototype parity: FOV+8 in fever, shake on
 * demand, gameplay framing untouched by attract mode). Pure three.js
 * scene-graph math — no renderer needed.
 */

function rigAt(speedTarget = 60): { rig: CameraRig; bird: Bird; terrain: TerrainSystem } {
  const terrain = new TerrainSystem("2026-09-14");
  const bird = new Bird();
  bird.reset(200, terrain.heightAt(200) + 20);
  bird.vx = speedTarget;
  bird.vy = 0;
  bird.grounded = false;
  const rig = new CameraRig(16 / 9);
  rig.snapTo(bird);
  return { rig, bird, terrain };
}

function settle(rig: CameraRig, bird: Bird, frames: number, fever: boolean, attract = false): void {
  for (let i = 0; i < frames; i++) rig.update(1 / 60, bird, true, 0, attract, fever);
}

describe("fever FOV kick", () => {
  it("widens the lens ~8° in fever and relaxes after", () => {
    const { rig, bird, terrain } = rigAt();
    settle(rig, bird, 240, false);
    const calm = rig.camera.fov;
    settle(rig, bird, 240, true);
    expect(rig.camera.fov - calm).toBeGreaterThan(6);
    expect(rig.camera.fov - calm).toBeLessThan(10);
    settle(rig, bird, 240, false);
    expect(Math.abs(rig.camera.fov - calm)).toBeLessThan(0.5);
    terrain.dispose();
  });

  it("stays calm under reduce-motion", () => {
    const { rig, bird, terrain } = rigAt();
    rig.setReduceMotion(true);
    settle(rig, bird, 240, false);
    const calm = rig.camera.fov;
    settle(rig, bird, 240, true);
    expect(Math.abs(rig.camera.fov - calm)).toBeLessThan(0.5);
    terrain.dispose();
  });
});

describe("attract bird visibility", () => {
  // The menu card covers roughly the middle third of a wide screen
  // (ndc.x in [-0.3, +0.3] at 16:9). The demo bird must settle left of it
  // yet stay on screen, at cruise, dive-bomb and high altitude.
  const v = new THREE.Vector3();
  function settledNdc(speed: number, altitude: number): { x: number; y: number } {
    const terrain = new TerrainSystem("2026-09-14");
    const bird = new Bird();
    bird.reset(400, terrain.heightAt(400) + Math.max(0.9, altitude));
    bird.vx = speed;
    bird.vy = 0;
    bird.grounded = false;
    const rig = new CameraRig(16 / 9);
    rig.snapTo(bird);
    for (let i = 0; i < 400; i++) rig.update(1 / 60, bird, false, terrain.heightAt(bird.x), true);
    v.set(bird.x, bird.y, 0).project(rig.camera);
    const out = { x: v.x, y: v.y };
    terrain.dispose();
    return out;
  }

  it.each([
    ["cruise", 45, 12],
    ["fast dive", 95, 25],
    ["high soar", 70, 120],
    ["low skim", 55, 2],
  ])("keeps the bird in the open left margin (%s)", (_label, speed, alt) => {
    const ndc = settledNdc(speed, alt);
    expect(ndc.x).toBeLessThan(-0.35);
    expect(ndc.x).toBeGreaterThan(-0.95);
    expect(Math.abs(ndc.y)).toBeLessThan(0.85);
  });
});

describe("attract framing", () => {
  it("pulls back and leads farther than gameplay framing", () => {
    const a = rigAt();
    settle(a.rig, a.bird, 240, false, true);
    const attractZ = a.rig.camera.position.z;
    const b = rigAt();
    settle(b.rig, b.bird, 240, false, false);
    expect(attractZ).toBeGreaterThan(b.rig.camera.position.z + 8);
    a.terrain.dispose();
    b.terrain.dispose();
  });
});
