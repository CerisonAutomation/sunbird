import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TerrainSystem } from "../TerrainSystem";
import { CHUNK_RES, CHUNK_SIZE } from "../constants";

/**
 * Streaming budget for the infinite world.
 *
 * The terrain is generated procedurally and chunk-streamed, so the whole world
 * is unbounded — which means per-chunk allocation shows up as GC stutter that
 * grows with flight length. Before pooling, a 20 km flight allocated 5,659
 * Float32Arrays (12.0 MB of garbage) and disposed 2,097 geometries. These tests
 * pin the pooled behaviour so it cannot silently regress.
 *
 * These run headless: BufferGeometry works in node without a GL context, so
 * this measures the real code path rather than a stand-in.
 */

/** Wrap Float32Array so construction can be counted without changing behaviour. */
function countFloat32Arrays(run: () => void): { count: number; bytes: number } {
  const Real = globalThis.Float32Array;
  let count = 0;
  let bytes = 0;
  const Wrapped = function (this: unknown, ...args: unknown[]) {
    count++;
    // @ts-expect-error dynamic constructor call
    const a = new Real(...args);
    bytes += a.byteLength;
    return a;
  } as unknown as typeof Float32Array;
  (Wrapped as unknown as { prototype: unknown }).prototype = Real.prototype;
  Object.setPrototypeOf(Wrapped, Real);
  globalThis.Float32Array = Wrapped;
  try {
    run();
  } finally {
    globalThis.Float32Array = Real;
  }
  return { count, bytes };
}

function countGeometryDisposals(run: () => void): number {
  let disposals = 0;
  const real = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () {
    disposals++;
    return real.call(this);
  };
  try {
    run();
  } finally {
    THREE.BufferGeometry.prototype.dispose = real;
  }
  return disposals;
}

/** ~4 units per frame at ~100 u/s and 60fps: one long run, 20 km of world. */
function fly(t: TerrainSystem, km = 20, step = 4): void {
  for (let x = 0; x <= km * 1000; x += step) t.update(x);
}

describe("infinite-world streaming budget", () => {
  it("generates a long flight almost without allocation", () => {
    const t = new TerrainSystem("budget-seed");
    const { count, bytes } = countFloat32Arrays(() => fly(t));
    // Warmup allocates the pool and the four far layers; after that a 20 km
    // flight should be close to allocation-free. The old code was 5,659.
    expect(count).toBeLessThan(2000);
    // Old code: 12.0 MB of garbage.
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });

  it("never disposes a streamed geometry", () => {
    const t = new TerrainSystem("dispose-seed");
    const disposals = countGeometryDisposals(() => fly(t));
    // Everything is pooled or built once. Old code: 2,097 disposals.
    expect(disposals).toBe(0);
  });

  it("reuses chunk geometry objects once the pool is warm", () => {
    const t = new TerrainSystem("pool-seed");
    // Collect every distinct terrain geometry the streamer uses. Reuse means
    // this set stays bounded by the pool instead of growing with distance.
    const seen = new Set<THREE.BufferGeometry>();
    const collect = (): void => {
      t.group.traverse((o) => {
        const m = o as THREE.Mesh;
        const mat = m.material as THREE.MeshLambertMaterial | undefined;
        if (m.isMesh && mat?.vertexColors && m.geometry.getIndex()) seen.add(m.geometry);
      });
    };
    for (let x = 0; x <= 20000; x += 4) {
      t.update(x);
      if (x % 720 === 0) collect();
    }
    collect();
    // 19 chunks are live at once (4 back + 14 forward + 1) and the pool holds
    // up to 24, so a bounded few dozen is reuse; thousands would be churn.
    expect(seen.size).toBeGreaterThan(0);
    expect(seen.size).toBeLessThanOrEqual(60);
  });
});

describe("pooled chunk geometry is still correct", () => {
  it("matches the height field after being rewritten in place", () => {
    const t = new TerrainSystem("correct-seed");
    // Force several chunks to be built, evicted and their buffers reused.
    fly(t, 2);

    const chunkId = Math.floor(6000 / CHUNK_SIZE);
    t.update(chunkId * CHUNK_SIZE);

    // Find the terrain mesh: the chunk child using vertex colours.
    const n = Math.ceil(CHUNK_SIZE / CHUNK_RES);
    const x0 = chunkId * CHUNK_SIZE;

    // Several chunk meshes match; take the one whose first column sits at x0.
    let geo: THREE.BufferGeometry | undefined;
    t.group.traverse((o) => {
      const m = o as THREE.Mesh;
      const mat = m.material as THREE.MeshLambertMaterial | undefined;
      if (!m.isMesh || !mat?.vertexColors || !m.geometry.getIndex()) return;
      const a = m.geometry.getAttribute("position") as THREE.BufferAttribute;
      if (Math.abs(a.getX(0) - x0) < 1e-3) geo = m.geometry;
    });
    expect(geo).toBeDefined();

    const pos = geo!.getAttribute("position") as THREE.BufferAttribute;

    // Stride is 4 verts per column; vertex 0 of each column is the ridge line,
    // which must sit exactly on heightAt(x).
    let checked = 0;
    for (let i = 0; i <= n; i++) {
      const v = i * 4;
      // Sample the height field at the exact float64 x, not at the value read
      // back out of the float32 position buffer — that rounding alone moves the
      // result by more than a 1e-5 tolerance.
      const x = x0 + (i * CHUNK_SIZE) / n;
      expect(pos.getX(v)).toBeCloseTo(x, 3);
      expect(pos.getY(v)).toBeCloseTo(t.heightAt(x), 4);
      checked++;
    }
    expect(checked).toBe(n + 1);

    // Index count must match the fixed topology, and stay within Uint16 range.
    const index = geo!.getIndex()!;
    expect(index.count).toBe(n * 18);
    for (let i = 0; i < index.count; i++) expect(index.getX(i)).toBeLessThan(65536);
  });

  it("updates the far parallax layers in place, keeping one topology", () => {
    const t = new TerrainSystem("far-seed");
    const far: THREE.Mesh[] = [];
    t.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.frustumCulled === false && (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
        far.push(m);
      }
    });
    expect(far.length).toBe(4);

    t.update(0);
    const before = far.map((m) => (m.geometry.getAttribute("position") as THREE.BufferAttribute).array);
    const geoBefore = far.map((m) => m.geometry);

    t.update(5000);
    const after = far.map((m) => (m.geometry.getAttribute("position") as THREE.BufferAttribute).array);

    // Same underlying arrays and same geometry objects — heights rewritten,
    // nothing reallocated.
    for (let i = 0; i < 4; i++) {
      expect(after[i]).toBe(before[i]);
      expect(far[i]!.geometry).toBe(geoBefore[i]);
    }
    // And they really did move with the camera.
    const firstX = (far[0]!.geometry.getAttribute("position") as THREE.BufferAttribute).getX(0);
    expect(firstX).toBeCloseTo(5000 - 350, 1);
  });
});
