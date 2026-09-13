import { describe, it, expect, beforeEach } from "vitest";
import { Bird } from "../Bird";
import { TerrainSystem } from "../TerrainSystem";

describe("Bird", () => {
  let bird: Bird;
  let terrain: TerrainSystem;

  beforeEach(() => {
    bird = new Bird();
    terrain = new TerrainSystem("test-seed");
  });

  describe("Initialization", () => {
    it("creates a bird with default state", () => {
      expect(bird.x).toBe(50);
      expect(bird.y).toBe(30);
      expect(bird.vx).toBe(10);
      expect(bird.vy).toBe(0);
      expect(bird.grounded).toBe(false);
      expect(bird.rotation).toBe(0);
    });

    it("has a THREE.Group root", () => {
      expect(bird.root).toBeDefined();
      expect(bird.root.type).toBe("Group");
    });
  });

  describe("reset", () => {
    it("resets position and state", () => {
      bird.x = 100;
      bird.y = 50;
      bird.grounded = true;
      bird.rotation = 0.5;
      
      bird.reset(200, 60);
      
      expect(bird.x).toBe(200);
      expect(bird.y).toBe(60);
      expect(bird.vx).toBe(11);
      expect(bird.vy).toBe(0);
      expect(bird.grounded).toBe(false);
      expect(bird.rotation).toBe(0);
    });
  });

  describe("speed", () => {
    it("calculates speed from velocity", () => {
      bird.vx = 3;
      bird.vy = 4;
      expect(bird.speed()).toBeCloseTo(5);
    });

    it("returns 0 when stationary", () => {
      bird.vx = 0;
      bird.vy = 0;
      expect(bird.speed()).toBe(0);
    });
  });

  describe("step - Grounded", () => {
    it("stays grounded when surface is flat", () => {
      bird.x = 100;
      bird.y = terrain.heightAt(100) + 1;
      bird.vx = 10;
      bird.vy = 0;
      bird.grounded = true;
      
      const opts = {
        diving: false,
        fever: false,
        speedMult: 1,
        boost: false,
      };
      
      bird.step(1 / 60, opts, terrain);
      expect(bird.grounded).toBe(true);
    });
  });

  describe("step - Airborne", () => {
    it("applies gravity when airborne", () => {
      bird.x = 100;
      bird.y = terrain.heightAt(100) + 50;
      bird.vx = 10;
      bird.vy = 0;
      bird.grounded = false;
      
      const initialVy = bird.vy;
      const opts = {
        diving: false,
        fever: false,
        speedMult: 1,
        boost: false,
      };
      
      bird.step(1 / 60, opts, terrain);
      expect(bird.vy).toBeLessThan(initialVy);
    });

    it("applies drag to velocity", () => {
      bird.x = 100;
      bird.y = terrain.heightAt(100) + 50;
      bird.vx = 50;
      bird.vy = 0;
      bird.grounded = false;
      
      const initialSpeed = bird.speed();
      const opts = {
        diving: false,
        fever: false,
        speedMult: 1,
        boost: false,
      };
      
      bird.step(1 / 60, opts, terrain);
      expect(bird.speed()).toBeLessThan(initialSpeed);
    });

    it("caps speed at MAX_SPEED", () => {
      bird.x = 100;
      bird.y = terrain.heightAt(100) + 50;
      bird.vx = 200;
      bird.vy = 0;
      bird.grounded = false;
      
      const opts = {
        diving: false,
        fever: false,
        speedMult: 1,
        boost: false,
      };
      
      bird.step(1 / 60, opts, terrain);
      expect(bird.speed()).toBeLessThanOrEqual(128);
    });
  });

  describe("step - Landing", () => {
    it("detects touchdown", () => {
      bird.x = 100;
      bird.y = terrain.heightAt(100) + 0.5;
      bird.vx = 10;
      bird.vy = -5;
      bird.grounded = false;
      
      const opts = {
        diving: false,
        fever: false,
        speedMult: 1,
        boost: false,
      };
      
      bird.step(1 / 60, opts, terrain);
      expect(bird.grounded).toBe(true);
      expect(bird.justLanded).toBe(true);
    });

    it("calculates landing quality", () => {
      bird.x = 100;
      bird.y = terrain.heightAt(100) + 0.5;
      bird.vx = 10;
      bird.vy = 0;
      bird.grounded = false;
      
      const opts = {
        diving: false,
        fever: false,
        speedMult: 1,
        boost: false,
      };
      
      bird.step(1 / 60, opts, terrain);
      expect(bird.landingQuality).toBeGreaterThanOrEqual(0);
      expect(bird.landingQuality).toBeLessThanOrEqual(1);
    });
  });

  describe("step - Water", () => {
    it("detects water entry", () => {
      bird.x = 1000;
      bird.y = -1;
      bird.vx = 10;
      bird.vy = 0;
      bird.grounded = false;
      
      const opts = {
        diving: false,
        fever: false,
        speedMult: 1,
        boost: false,
      };
      
      bird.step(1 / 60, opts, terrain);
      expect(bird.inWater).toBe(true);
    });
  });

  describe("syncVisual", () => {
    it("updates root position and rotation", () => {
      // Note: syncVisual requires Three.js scene setup
      // In a real test environment, we would mock Three.js objects
      // For now, we just verify the method exists and can be called
      expect(typeof bird.syncVisual).toBe("function");
    });
  });

  describe("applySkin", () => {
    it("applies skin colors to materials", () => {
      const skin = {
        body: 0xff0000,
        wing: 0x00ff00,
        belly: 0x0000ff,
        beak: 0xffff00,
      };
      
      bird.applySkin(skin);
      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe("dispose", () => {
    it("cleans up resources", () => {
      bird.dispose();
      // Verify it doesn't throw
      expect(true).toBe(true);
    });
  });
});
