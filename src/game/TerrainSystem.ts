import * as THREE from "three";
import { biomeForIsland, gapEndFor, rampPeakFor, tierForIsland, type BiomeDef, type DecoKind } from "./Biomes";
import {
  CHUNK_RES,
  CHUNK_SIZE,
  GAP_START,
  ISLAND_PERIOD,
  OCEAN_FLOOR,
  RAMP_START,
  TERRAIN_FACE_DEPTH,
  TERRAIN_HALF_Z,
  VISIBLE_CHUNKS_BACK,
  VISIBLE_CHUNKS_FWD,
  WATER_Y,
} from "./constants";
import { clamp, fbm, hash01, lerp, SeededRandom, smoothstep, valueNoise } from "./math";

const HEIGHT_CACHE_SIZE = 4096;
const HEIGHT_CACHE_MASK = HEIGHT_CACHE_SIZE - 1;

/** One smooth cosine arch of terrain with an authored intent. */
type Segment = { start: number; len: number; height: number; base: number; baseNext: number };

/** Chunk mesh dimensions, derived once from the streaming constants. */
const CHUNK_SEGMENTS = Math.ceil(CHUNK_SIZE / CHUNK_RES);
const CHUNK_STRIDE = 4;
const CHUNK_VERTS = (CHUNK_SEGMENTS + 1) * CHUNK_STRIDE;
/** 6 triangles per segment x 3 index entries. */
const CHUNK_INDEX_COUNT = CHUNK_SEGMENTS * 18;
/**
 * Pool ceiling. The visible window is VISIBLE_CHUNKS_BACK + _FWD + 1 chunks,
 * so this only needs enough slack to cover a burst of spawns before the
 * matching evictions land.
 */
const GEO_POOL_MAX = 24;

/** Far parallax layers. Buffers built once, heights rewritten in place. */
const FAR_SAMPLES = 120;
const FAR_VERTS = (FAR_SAMPLES + 1) * 2;
const FAR_INDEX_COUNT = FAR_SAMPLES * 6;

/**
 * Reusable attribute buffers for one terrain chunk.
 */
type ChunkBuffers = {
  geo: THREE.BufferGeometry;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  index: Uint16Array;
};

type Placement = { x: number; y: number; z: number; s: number; rot: number };
type PropGroup = { props: Placement[]; parts: { inst: THREE.InstancedMesh; part: DecoPart }[]; faded: Set<number> };

type Chunk = {
  id: number;
  group: THREE.Group;
  disposables: { dispose(): void }[];
  /** Pooled attribute buffers — returned to the pool on eviction, not freed. */
  buffers: ChunkBuffers;
  /** Foreground-capable prop groups for updateOcclusion. */
  propGroups?: PropGroup[];
};

export type TerrainPalette = {
  farA: THREE.Color;
  farB: THREE.Color;
  farC: THREE.Color;
};

type DecoPart = { geo: THREE.BufferGeometry; mat: THREE.MeshLambertMaterial; y: number; s: number };

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

export class TerrainSystem {
  readonly group = new THREE.Group();
  readonly seedStr: string;
  readonly seedN: number;
  private readonly chunks = new Map<number, Chunk>();
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly farMats: THREE.MeshBasicMaterial[] = [];
  private readonly farMeshes: THREE.Mesh[] = [];
  /** Preallocated far-layer vertex buffers, rewritten by rebuildFar. */
  private readonly farPos: Float32Array[] = [];
  private readonly decoParts = new Map<DecoKind, DecoPart[]>();
  private farCenter = -9999;
  private farIsland = -1;
  private readonly segCache = new Map<number, Segment[]>();
  private readonly hKey = new Int32Array(HEIGHT_CACHE_SIZE).fill(0x7fffffff);
  private readonly hVal = new Float64Array(HEIGHT_CACHE_SIZE);
  /** Flow calibration: <1 gentler arches, >1 tighter and steeper. */
  private difficulty = 1;
  /** Free chunk buffers, reused instead of re-allocated every spawn. */
  private readonly geoPool: ChunkBuffers[] = [];
  // Scratch colours — were six allocations per chunk, now instance fields.
  private readonly cTop = new THREE.Color();
  private readonly cRidge = new THREE.Color();
  private readonly cMid = new THREE.Color();
  private readonly cDeep = new THREE.Color();
  private readonly cSand = new THREE.Color();
  private readonly cSnow = new THREE.Color(0xf4f8ff);

  constructor(seedStr: string) {
    this.seedStr = seedStr;
    const rng = new SeededRandom(seedStr);
    this.seedN = (rng.seed % 99991) + 17;

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });

    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x6b9e7a, side: THREE.DoubleSide });
      this.farMats.push(m);
      const positions = new Float32Array(FAR_VERTS * 3);
      const index = new Uint16Array(FAR_INDEX_COUNT);
      for (let j = 0; j < FAR_SAMPLES; j++) {
        const a = j * 2;
        const o = j * 6;
        index[o] = a; index[o + 1] = a + 1; index[o + 2] = a + 2;
        index[o + 3] = a + 1; index[o + 4] = a + 3; index[o + 5] = a + 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      this.farPos.push(positions);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.z = -24 - i * 32;
      mesh.frustumCulled = false;
      // Static background — no per-frame matrix update needed
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.farMeshes.push(mesh);
      this.group.add(mesh);
    }
    this.buildDecoParts();
  }

  /* ------------------------------------------------------------ queries */

  biomeAt(x: number): BiomeDef {
    return biomeForIsland(this.islandIndex(x));
  }

  /**
   * Height is the hottest function in the game (~15 calls per physics step,
   * plus terrain meshing and collectible placement). Results are memoised in a
   * small direct-mapped cache keyed on the quantised x, which turns the
   * repeated slope/curvature probes around the bird into cache hits.
   */
  heightAt(x: number): number {
    const key = Math.round(x * 64);
    const slot = key & HEIGHT_CACHE_MASK;
    if (this.hKey[slot] === key) return this.hVal[slot]!;
    const v = this.computeHeight(x);
    this.hKey[slot] = key;
    this.hVal[slot] = v;
    return v;
  }

  private computeHeight(x: number): number {
    const island = this.islandIndex(x);
    const lx = this.localX(x);
    const gapEnd = gapEndFor(island);
    const hills = this.hills(x, island);

    if (lx >= GAP_START && lx < gapEnd) {
      const drop = smoothstep(GAP_START, GAP_START + 10, lx) * (1 - smoothstep(gapEnd - 22, gapEnd, lx));
      return lerp(hills, OCEAN_FLOOR, drop);
    }

    let h = hills;
    if (lx > RAMP_START && lx < GAP_START) {
      const t = smoothstep(RAMP_START, GAP_START, lx);
      const peak = rampPeakFor(island) + 14 * t;
      h = lerp(h, peak, t);
    }

    // landing shelf at the start of every island (after the gap wraps)
    const prevGapEnd = gapEndFor(island - 1);
    const shelfLen = 55 + Math.max(0, prevGapEnd - (GAP_START + 148)) * 0.4;
    if (lx < shelfLen) {
      const land = smoothstep(0, shelfLen * 0.65, lx);
      const landing = 16 + 6 * Math.sin(lx * 0.08);
      h = lerp(landing, h, land);
    }

    if (x < 260) {
      const w = 1 - smoothstep(160, 270, x);
      const tutorial = 16 + 15 * Math.cos((x - 48) * 0.027);
      h = lerp(h, Math.max(4.5, tutorial), w);
    }
    return h;
  }

  slopeAt(x: number): number {
    const e = 0.45;
    return (this.heightAt(x + e) - this.heightAt(x - e)) / (2 * e);
  }

  normalAt(x: number): { nx: number; ny: number; tx: number; ty: number } {
    const slope = this.slopeAt(x);
    const len = Math.hypot(1, slope);
    return { tx: 1 / len, ty: slope / len, nx: -slope / len, ny: 1 / len };
  }

  /**
   * Signed path curvature (1/radius).
   *  > 0  convex — a crest curving away beneath you (this is what launches you)
   *  < 0  concave — a valley floor pressing up into you
   */
  curvatureAt(x: number): number {
    const e = 1.1;
    const h0 = this.heightAt(x - e);
    const h1 = this.heightAt(x);
    const h2 = this.heightAt(x + e);
    const d2 = (h0 - 2 * h1 + h2) / (e * e);
    const slope = this.slopeAt(x);
    return -d2 / Math.pow(1 + slope * slope, 1.5);
  }

  isOcean(x: number): boolean {
    const lx = this.localX(x);
    return lx >= GAP_START && lx < gapEndFor(this.islandIndex(x));
  }

  islandIndex(x: number): number {
    return Math.max(0, Math.floor(x / ISLAND_PERIOD));
  }

  localX(x: number): number {
    const p = ISLAND_PERIOD;
    return ((x % p) + p) % p;
  }

  /* ------------------------------------------------------------ update */

  /** Set by the FlowTuner so challenge tracks measured skill. */
  setDifficulty(d: number): void {
    if (Math.abs(d - this.difficulty) < 0.01) return;
    this.difficulty = d;
    this.invalidate();
  }

  /** Drop the height cache (call when the world changes shape). */
  invalidate(): void {
    this.hKey.fill(0x7fffffff);
    this.segCache.clear();
  }

  update(camX: number): void {
    const center = Math.floor(camX / CHUNK_SIZE);
    const lo = center - VISIBLE_CHUNKS_BACK;
    const hi = center + VISIBLE_CHUNKS_FWD;
    for (let id = lo; id <= hi; id++) if (!this.chunks.has(id)) this.spawnChunk(id);
    for (const [id, chunk] of this.chunks) {
      if (id < lo || id > hi) {
        this.group.remove(chunk.group);
        for (const d of chunk.disposables) d.dispose();
        this.releaseBuffers(chunk.buffers);
        this.chunks.delete(id);
      }
    }
    if (Math.abs(camX - this.farCenter) > 40) {
      this.rebuildFar(camX);
      this.farCenter = camX;
    }
  }

  /** Blend sky-driven far colours with the current biome's silhouettes. */
  setPalette(p: TerrainPalette, camX: number): void {
    const b = this.biomeAt(camX + 120);
    this.farMats[0]?.color.copy(p.farA).lerp(tmpColor.setHex(b.farA), 0.55);
    this.farMats[1]?.color.copy(p.farB).lerp(tmpColor.setHex(b.farB), 0.55);
    this.farMats[2]?.color.copy(p.farC).lerp(tmpColor.setHex(b.farC), 0.55);
    this.farMats[3]?.color.copy(p.farC).lerp(tmpColor.setHex(b.deep), 0.65);
    const island = this.islandIndex(camX);
    if (island !== this.farIsland) this.farIsland = island;
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) {
      this.group.remove(chunk.group);
      for (const d of chunk.disposables) d.dispose();
      chunk.buffers.geo.dispose();
      chunk.buffers.geo.dispose();
    }
    this.chunks.clear();
    // Pooled buffers are still live GPU resources — free them on teardown.
    for (const rec of this.geoPool) rec.geo.dispose();
    this.geoPool.length = 0;
    // Pooled buffers are still live GPU resources — free them on teardown.
    for (const rec of this.geoPool) rec.geo.dispose();
    this.geoPool.length = 0;
    this.mat.dispose();
    for (const m of this.farMats) m.dispose();
    for (const mesh of this.farMeshes) mesh.geometry.dispose();
    for (const parts of this.decoParts.values()) {
      for (const p of parts) {
        p.geo.dispose();
        p.mat.dispose();
      }
    }
  }

  /* ------------------------------------------------------------ hills */

  /**
   * Momentum-first hill generation.
   *
   * Instead of stacking noise (which makes lumpy, unreadable slopes) the island
   * is cut into *segments* with an intent: rollers to warm up, a deep carving
   * valley, a launch ramp, a long glide. Each segment is a single smooth
   * cosine arch, so every valley has continuous curvature and every crest is a
   * clean lip you can time a release against. Segment lengths are derived from
   * the speed the player is expected to be carrying, so ramps stay hittable.
   */
  private hills(x: number, island: number): number {
    const b = biomeForIsland(island);
    const tier = tierForIsland(island);
    const amp = b.amp * (1 + tier * 0.06 + Math.min(0.22, island * 0.01));
    const wave = b.wave;

    const local = this.localX(x);
    const seg = this.segmentAt(local, island);
    const t = (local - seg.start) / seg.len; // 0..1 across this arch
    // cosine arch: 0 at the ends, 1 at the middle — C1-continuous when chained
    let arch = 0.5 - 0.5 * Math.cos(Math.PI * 2 * t);

    // Hill style reshapes the arch for biome character
    switch (b.hillStyle) {
      case "sharp":
        arch = Math.pow(arch, 1.6); // steeper crests, narrower peaks
        break;
      case "plateau":
        arch = arch > 0.82 ? 1.0 : arch / 0.82; // flat-topped hills
        break;
      case "wave":
        arch += 0.12 * Math.sin(x * 0.07 + this.seedN * 0.3); // undulating overlay
        arch = Math.max(0, Math.min(1, arch));
        break;
      case "jagged":
        arch += 0.18 * (valueNoise(x * 0.12, this.seedN + 5) - 0.5) * 2; // rough edges
        arch = Math.max(0, Math.min(1, arch));
        break;
    }

    // Base terrain line drifts slowly so the world isn't a flat conveyor.
    const base = seg.base + (seg.baseNext - seg.base) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    let h = base + seg.height * amp * arch;

    // Noise character varies by hill style
    const noiseScale = b.hillStyle === "jagged" ? 1.5 : 0.85;
    const detailScale = b.hillStyle === "jagged" ? 0.6 : 0.35;
    h += noiseScale * (fbm(x * 0.02 / wave, this.seedN, 3) - 0.5) * 2;
    h += detailScale * (valueNoise(x * 0.08, this.seedN + 9) - 0.5) * 2;
    return Math.max(3.4, h);
  }

  /**
   * Deterministic segment layout for one island. Cached per island so
   * heightAt() stays cheap (it is called thousands of times per frame).
   */
  private segmentAt(local: number, island: number): Segment {
    let segs = this.segCache.get(island);
    if (!segs) {
      segs = this.buildSegments(island);
      this.segCache.set(island, segs);
      if (this.segCache.size > 6) {
        const oldest = this.segCache.keys().next().value;
        if (oldest !== undefined && oldest !== island) this.segCache.delete(oldest);
      }
    }
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid]!.start <= local) lo = mid;
      else hi = mid - 1;
    }
    return segs[lo]!;
  }

  private buildSegments(island: number): Segment[] {
    const b = biomeForIsland(island);
    const tier = tierForIsland(island);
    const rng = new SeededRandom(`${this.seedStr}:isle:${island}`);
    const out: Segment[] = [];
    let cursor = 0;
    let base = 11;

    // Wavelength scales with the speed the player should be carrying here, so
    // ramps arrive at a rhythm the bird can actually match.
    const speedScale = ((1 + Math.min(0.28, island * 0.02) + tier * 0.03) * b.wave) / this.difficulty;

    const push = (len: number, height: number, nextBase: number): void => {
      out.push({ start: cursor, len, height, base, baseNext: nextBase });
      cursor += len;
      base = nextBase;
    };

    // Island 0 opens gently: three teaching rollers with a clean rhythm.
    if (island === 0) {
      push(96, 15, 11);
      push(80, 19, 12);
      push(84, 23, 12);
    }

    const budget = RAMP_START - cursor - 40;
    let used = 0;
    let sincePerfect = 0;
    while (used < budget) {
      const remaining = budget - used;
      const roll = rng.next();
      let len: number;
      let height: number;

      // Every few segments, lay a deliberate "perfect ramp sequence":
      // deep valley -> tight kicker -> long glide. Chainable by a good player.
      // Height-to-length ratio is the real tuning knob: it decides how sharply
      // a crest curves away, and therefore how steeply you can launch off it.
      if (sincePerfect >= 3 && remaining > 380 && roll > 0.4) {
        sincePerfect = 0;
        const s = speedScale;
        push(92 * s, 24 * b.amp, base - 2); // deep carving valley
        push(64 * s, 25 * b.amp, base + 1); //  kicker with a crisp lip
        push(78 * s, 19 * b.amp, base); //     landing roller
        push(100 * s, 30 * b.amp, base); //     big launch ramp
        used += (92 + 64 + 78 + 100) * s;
        continue;
      }

      if (roll < 0.26) {
        len = rng.range(58, 74) * speedScale; // quick roller
        height = rng.range(11, 15) * b.amp;
      } else if (roll < 0.6) {
        len = rng.range(76, 104) * speedScale; // medium rolling hill
        height = rng.range(17, 24) * b.amp;
      } else if (roll < 0.82) {
        len = rng.range(112, 148) * speedScale; // long smooth slope
        height = rng.range(24, 32) * b.amp;
      } else {
        len = rng.range(150, 190) * speedScale; // occasional huge ramp
        height = rng.range(34, 44) * b.amp;
      }
      if (len > remaining) len = Math.max(62, remaining);
      const drift = rng.range(-2.5, 2.5);
      push(len, height, clamp(base + drift, 7, 20));
      used += len;
      sincePerfect += 1;
    }

    // Run the final arch out past the ramp zone so lookups never fall off the end.
    push(ISLAND_PERIOD - cursor + 200, 16 * b.amp, base);
    return out;
  }

  /* ------------------------------------------------------------ chunks */

  private spawnChunk(id: number): void {
    const group = new THREE.Group();
    const disposables: { dispose(): void }[] = [];
    // The terrain geometry is pooled — NOT pushed into disposables.
    // Eviction returns it to the pool rather than freeing it.
    const buffers = this.acquireBuffers();
    this.fillBuffers(buffers, id);
    const mesh = new THREE.Mesh(buffers.geo, this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Static meshes don't need per-frame matrix recomputation (saves ~1.2ms/frame)
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    const propGroups = this.placeDecor(id, group, disposables);
    this.group.add(group);
    this.chunks.set(id, { id, group, disposables, buffers, propGroups: propGroups.length ? propGroups : undefined });
  }

  /** Take a chunk's buffers from the pool, or allocate them the first time. */
  private acquireBuffers(): ChunkBuffers {
    const pooled = this.geoPool.pop();
    if (pooled) return pooled;
    const positions = new Float32Array(CHUNK_VERTS * 3);
    const normals = new Float32Array(CHUNK_VERTS * 3);
    const colors = new Float32Array(CHUNK_VERTS * 3);
    const index = new Uint16Array(CHUNK_INDEX_COUNT);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    return { geo, positions, normals, colors, index };
  }

  /** Return a chunk's buffers to the pool instead of freeing them. */
  private releaseBuffers(rec: ChunkBuffers): void {
    if (this.geoPool.length < GEO_POOL_MAX) this.geoPool.push(rec);
    else rec.geo.dispose();
  }

  private fillBuffers(rec: ChunkBuffers, id: number): void {
    const x0 = id * CHUNK_SIZE;
    const n = CHUNK_SEGMENTS;
    const dx = CHUNK_SIZE / n;
    const hz = TERRAIN_HALF_Z;
    const depth = TERRAIN_FACE_DEPTH;
    const overlap = Math.max(0.35, dx * 0.5);

    const stride = CHUNK_STRIDE;
    const { positions, normals, colors, index, geo } = rec;

    // Instance scratch colours — these were six allocations per chunk.
    const cTop = this.cTop;
    const cRidge = this.cRidge;
    const cMid = this.cMid;
    const cDeep = this.cDeep;
    const cSand = this.cSand;
    const snow = this.cSnow;

    let ii = 0;

    for (let i = 0; i <= n; i++) {
      const x = x0 + i * dx - (i === 0 ? overlap : i === n ? -overlap : 0);
      const y = this.heightAt(x);
      const nrm = this.normalAt(x);
      const b = this.biomeAt(x);

      // blend biome colours across island boundaries so the seam is soft
      const lx = this.localX(x);
      const nextB = biomeForIsland(this.islandIndex(x) + 1);
      const blend = smoothstep(ISLAND_PERIOD - 90, ISLAND_PERIOD, lx);
      cTop.setHex(b.top).lerp(tmpColor.setHex(nextB.top), blend);
      cRidge.setHex(b.ridge).lerp(tmpColor.setHex(nextB.ridge), blend);
      cMid.setHex(b.mid).lerp(tmpColor.setHex(nextB.mid), blend);
      cDeep.setHex(b.deep).lerp(tmpColor.setHex(nextB.deep), blend);
      cSand.setHex(b.sand);

      const wet = y < WATER_Y + 2.5 ? smoothstep(WATER_Y + 2.5, WATER_Y - 1, y) : 0;
      cTop.lerp(cSand, wet * 0.7);
      cRidge.lerp(cSand, wet * 0.5);

      const snowLine = lerp(b.snowLine || 999, nextB.snowLine || 999, blend);
      if (snowLine < 900) {
        const slopeRatio = Math.min(5, Math.abs(nrm.ty / (nrm.tx || 0.001)));
        const s = smoothstep(snowLine - 5, snowLine + 4, y) * (1 - smoothstep(0.55, 1.1, slopeRatio));
        cTop.lerp(snow, s);
        cRidge.lerp(snow, s * 0.7);
        cMid.lerp(snow, s * 0.35);
      }

      // Harmonious terrain strata bands: rhythmic pastel layers that give handcrafted paper-cutout depth
      const strata = Math.sin(y * 0.45 + x * 0.05) * 0.5 + 0.5;
      const waveBand = Math.sin(x * 0.09) * 0.5 + 0.5;
      cTop.lerp(cRidge, strata * 0.18 + waveBand * 0.1);
      cMid.lerp(cDeep, strata * 0.28);

      // subtle per-vertex variation for a hand-painted feel
      const v = (hash01(Math.floor(x * 0.5), this.seedN + 77) - 0.5) * 0.05;
      cTop.offsetHSL(0, 0, v);

      const base = i * stride;
      set3(positions, base + 0, x, y, -hz);
      set3(positions, base + 1, x, y, hz);
      set3(positions, base + 2, x, y - depth * 0.42, hz);
      set3(positions, base + 3, x, y - depth, hz);

      set3(normals, base + 0, nrm.nx, nrm.ny, 0.15);
      set3(normals, base + 1, nrm.nx * 0.3, nrm.ny * 0.3, 0.9);
      set3(normals, base + 2, 0, 0.15, 1);
      set3(normals, base + 3, 0, 0, 1);

      setC(colors, base + 0, cTop);
      setC(colors, base + 1, cRidge);
      setC(colors, base + 2, cMid);
      setC(colors, base + 3, cDeep);

      if (i < n) {
        const a = i * stride;
        const c = (i + 1) * stride;
        index[ii++] = a + 0; index[ii++] = c + 0; index[ii++] = a + 1;
        index[ii++] = a + 1; index[ii++] = c + 0; index[ii++] = c + 1;
        index[ii++] = a + 1; index[ii++] = c + 1; index[ii++] = a + 2;
        index[ii++] = a + 2; index[ii++] = c + 1; index[ii++] = c + 2;
        index[ii++] = a + 2; index[ii++] = c + 2; index[ii++] = a + 3;
        index[ii++] = a + 3; index[ii++] = c + 2; index[ii++] = c + 3;
      }
    }

    // The attributes were rewritten in place, so the GPU copies have to be
    // re-flagged and the culling sphere has to follow the new heights.
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("normal") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getIndex() as THREE.BufferAttribute).needsUpdate = true;
    geo.computeBoundingSphere();
  }

  /* ------------------------------------------------------------ decor */

  private buildDecoParts(): void {
    const lam = (color: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color, flatShading: true });
    this.decoParts.set("tree", [
      { geo: new THREE.CylinderGeometry(0.18, 0.26, 1.4, 5), mat: lam(0x6b4a2e), y: 0.7, s: 1 },
      { geo: new THREE.IcosahedronGeometry(1.25, 0), mat: lam(0x3f9a4f), y: 2.1, s: 1 },
    ]);
    this.decoParts.set("palm", [
      { geo: new THREE.CylinderGeometry(0.14, 0.22, 3.2, 5), mat: lam(0x9a6a3a), y: 1.6, s: 1 },
      { geo: new THREE.ConeGeometry(1.6, 0.7, 6), mat: lam(0x5aa84a), y: 3.3, s: 1 },
    ]);
    this.decoParts.set("pine", [
      { geo: new THREE.CylinderGeometry(0.14, 0.2, 1, 5), mat: lam(0x5a3e2a), y: 0.5, s: 1 },
      { geo: new THREE.ConeGeometry(0.95, 2.6, 6), mat: lam(0x2f6e4a), y: 2.2, s: 1 },
      { geo: new THREE.ConeGeometry(0.62, 1.6, 6), mat: lam(0x3a8a58), y: 3.4, s: 1 },
    ]);
    this.decoParts.set("spire", [
      { geo: new THREE.ConeGeometry(0.7, 3.4, 5), mat: lam(0x2a1a22), y: 1.6, s: 1 },
      { geo: new THREE.ConeGeometry(0.22, 1.1, 4), mat: lam(0xff7a2a), y: 3.2, s: 1 },
    ]);
    this.decoParts.set("crystal", [
      { geo: new THREE.OctahedronGeometry(1.1, 0), mat: lam(0x9ad8ff), y: 1.3, s: 1 },
      { geo: new THREE.OctahedronGeometry(0.6, 0), mat: lam(0xd8a8ff), y: 0.9, s: 1 },
    ]);
    this.decoParts.set("cactus", [
      { geo: new THREE.CylinderGeometry(0.3, 0.34, 2.6, 7), mat: lam(0x4f9a5a), y: 1.3, s: 1 },
      { geo: new THREE.CylinderGeometry(0.17, 0.17, 1.1, 6), mat: lam(0x59a866), y: 1.9, s: 1 },
    ]);
    this.decoParts.set("flower", [
      { geo: new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4), mat: lam(0x3a8a3a), y: 0.25, s: 1 },
      { geo: new THREE.SphereGeometry(0.22, 5, 4), mat: lam(0xe83a5a), y: 0.6, s: 1 },
      { geo: new THREE.SphereGeometry(0.18, 5, 4), mat: lam(0xf0c820), y: 0.55, s: 0.8 },
      { geo: new THREE.SphereGeometry(0.2, 5, 4), mat: lam(0x9a40c0), y: 0.58, s: 0.9 },
    ]);
    this.decoParts.set("rock", [
      { geo: new THREE.DodecahedronGeometry(0.55, 0), mat: lam(0x888888), y: 0.3, s: 1 },
      { geo: new THREE.DodecahedronGeometry(0.32, 0), mat: lam(0x777777), y: 0.2, s: 0.7 },
    ]);
    this.decoParts.set("mushroom", [
      { geo: new THREE.CylinderGeometry(0.04, 0.05, 0.5, 5), mat: lam(0xd8c8a0), y: 0.25, s: 1 },
      { geo: new THREE.SphereGeometry(0.24, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), mat: lam(0xd02020), y: 0.5, s: 1 },
    ]);
    this.decoParts.set("bush", [
      { geo: new THREE.SphereGeometry(0.38, 5, 4), mat: lam(0x3a7a3a), y: 0.3, s: 1 },
      { geo: new THREE.SphereGeometry(0.28, 5, 4), mat: lam(0x4a8a4a), y: 0.45, s: 0.8 },
      { geo: new THREE.SphereGeometry(0.22, 5, 4), mat: lam(0x559a55), y: 0.55, s: 0.6 },
    ]);
    this.decoParts.set("lantern", [
      { geo: new THREE.CylinderGeometry(0.03, 0.04, 1.6, 4), mat: lam(0x554433), y: 0.8, s: 1 },
      { geo: new THREE.OctahedronGeometry(0.18, 0), mat: lam(0xffdd66), y: 1.7, s: 1 },
    ]);
    this.decoParts.set("coral", [
      { geo: new THREE.CylinderGeometry(0.06, 0.08, 0.8, 4), mat: lam(0xe8688a), y: 0.4, s: 1 },
      { geo: new THREE.CylinderGeometry(0.04, 0.05, 0.5, 4), mat: lam(0xf09060), y: 0.7, s: 0.7 },
      { geo: new THREE.ConeGeometry(0.14, 0.4, 5), mat: lam(0xf07080), y: 0.9, s: 0.8 },
    ]);
    this.decoParts.set("ruin", [
      { geo: new THREE.CylinderGeometry(0.22, 0.28, 2.2, 6), mat: lam(0x8a8a8a), y: 1.1, s: 1 },
      { geo: new THREE.CylinderGeometry(0.26, 0.26, 0.18, 6), mat: lam(0x9a9a9a), y: 2.2, s: 1 },
    ]);
    this.decoParts.set("lighthouse", [
      { geo: new THREE.CylinderGeometry(0.2, 0.28, 3.4, 6), mat: lam(0xcc2222), y: 1.7, s: 1 },
      { geo: new THREE.CylinderGeometry(0.17, 0.2, 0.5, 6), mat: lam(0xffffff), y: 1.45, s: 1 },
      { geo: new THREE.CylinderGeometry(0.22, 0.22, 0.22, 6), mat: lam(0xddddaa), y: 3.5, s: 1 },
    ]);
    this.decoParts.set("windmill", [
      { geo: new THREE.CylinderGeometry(0.06, 0.08, 2.6, 5), mat: lam(0x6a5040), y: 1.3, s: 1 },
      { geo: new THREE.BoxGeometry(1.8, 0.12, 0.04), mat: lam(0x8a7060), y: 2.6, s: 1 },
      { geo: new THREE.BoxGeometry(0.12, 1.8, 0.04), mat: lam(0x8a7060), y: 2.6, s: 1 },
    ]);
    this.decoParts.set("candy", [
      { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), mat: lam(0xd8c8a0), y: 0.4, s: 1 },
      { geo: new THREE.SphereGeometry(0.24, 6, 5), mat: lam(0xff4488), y: 0.9, s: 1 },
      { geo: new THREE.SphereGeometry(0.18, 6, 5), mat: lam(0x44ccff), y: 0.8, s: 0.8 },
    ]);
    for (const parts of this.decoParts.values()) {
      for (const p of parts) if (p.mat.color.getHex() === 0x9ad8ff || p.mat.color.getHex() === 0xd8a8ff) p.mat.emissive.setHex(0x223355);
      for (const p of parts) if (p.mat.color.getHex() === 0xffdd66) p.mat.emissive.setHex(0xaa8822);
    }
  }

  private placeDecor(id: number, group: THREE.Group, disposables: { dispose(): void }[]): PropGroup[] {
    const x0 = id * CHUNK_SIZE;
    const biome = this.biomeAt(x0 + CHUNK_SIZE / 2);
    const propGroups: PropGroup[] = [];

    const emitGroup = (parts: DecoPart[], placements: Placement[]): void => {
      if (!placements.length || !parts.length) return;
      const made: { inst: THREE.InstancedMesh; part: DecoPart }[] = [];
      for (const part of parts) {
        const inst = new THREE.InstancedMesh(part.geo, part.mat, placements.length);
        inst.castShadow = true;
        inst.receiveShadow = true;
        placements.forEach((p, i) => {
          tmpObj.position.set(p.x, p.y + part.y * p.s, p.z);
          tmpObj.rotation.set(0, p.rot, 0);
          tmpObj.scale.setScalar(p.s * part.s);
          tmpObj.updateMatrix();
          inst.setMatrixAt(i, tmpObj.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = false;
        group.add(inst);
        disposables.push({ dispose: () => inst.dispose() });
        made.push({ inst, part });
      }
      // Foreground props (z > 0 camera side) feed updateOcclusion.
      if (made.length && placements.some((p) => p.z > 3.5)) {
        propGroups.push({ props: placements, parts: made, faded: new Set<number>() });
      }
    };

    // --- primary decoration layer ---
    const parts = this.decoParts.get(biome.deco);
    if (parts) {
      const count = Math.round(12 * biome.decoDensity);
      const placements: Placement[] = [];
      for (let i = 0; i < count; i++) {
        const r1 = hash01(id * 131 + i * 7, this.seedN + 301);
        const r2 = hash01(id * 131 + i * 7, this.seedN + 302);
        const r3 = hash01(id * 131 + i * 7, this.seedN + 303);
        const x = x0 + r1 * CHUNK_SIZE;
        if (this.isOcean(x) || x < 30) continue;
        const slope = Math.abs(this.slopeAt(x));
        if (slope > 0.55) continue;
        const lx = this.localX(x);
        if (lx > RAMP_START - 10 && lx < GAP_START) continue;
        const behind = r2 < 0.72;
        const z = behind ? -3.5 - r3 * 6 : 4.5 + r3 * 5;
        const s = (behind ? 0.9 : 0.6) + r3 * 0.5;
        placements.push({ x, y: this.heightAt(x) - 0.2, z, s, rot: r2 * Math.PI * 2 });
      }
      emitGroup(parts, placements);
    }

    // --- secondary decoration layer (smaller, sparser for visual depth) ---
    const secParts = this.decoParts.get(biome.secondaryDeco);
    if (secParts) {
      const secCount = Math.round(5 * biome.decoDensity);
      const secPlacements: Placement[] = [];
      for (let i = 0; i < secCount; i++) {
        const r1 = hash01(id * 97 + i * 13, this.seedN + 501);
        const r2 = hash01(id * 97 + i * 13, this.seedN + 502);
        const r3 = hash01(id * 97 + i * 13, this.seedN + 503);
        const x = x0 + r1 * CHUNK_SIZE;
        if (this.isOcean(x) || x < 30) continue;
        const slope = Math.abs(this.slopeAt(x));
        if (slope > 0.55) continue;
        const lx = this.localX(x);
        if (lx > RAMP_START - 10 && lx < GAP_START) continue;
        const behind = r2 < 0.65;
        const z = behind ? -4 - r3 * 5.5 : 5 + r3 * 4.5;
        const s = (behind ? 0.55 : 0.35) + r3 * 0.35;
        secPlacements.push({ x, y: this.heightAt(x) - 0.2, z, s, rot: r2 * Math.PI * 2 });
      }
      emitGroup(secParts, secPlacements);
    }

    return propGroups;
  }

  /**
   * Sink-and-shrink any foreground prop about to cross a bird's sight line, so
   * the player never loses sight of the bird behind a tree.
   */
  updateOcclusion(views: { x: number; y: number }[], camX: number, camY: number, camZ: number): void {
    if (views.length === 0 || camZ <= 4) return;
    for (const chunk of this.chunks.values()) {
      const groups = chunk.propGroups;
      if (!groups) continue;
      const cx0 = chunk.id * CHUNK_SIZE;
      if (cx0 > views[0]!.x + CHUNK_SIZE * 1.5 || cx0 + CHUNK_SIZE < views[0]!.x - CHUNK_SIZE * 1.5) {
        if (chunk.propGroups) this.restoreFaded(chunk.propGroups);
        continue;
      }
      for (const g of groups) {
        g.props.forEach((p, i) => {
          let occ = 0;
          if (p.z > 3.5) {
            const t = 1 - p.z / camZ;
            if (t > 0) {
              const top = p.y + 9.5 * p.s;
              for (const v of views) {
                const sx = camX + (v.x - camX) * t;
                const sy = camY + (v.y - camY) * t;
                const dx = Math.abs(p.x - sx);
                const r = p.s * 3.4;
                if (dx < r && sy > p.y - 2 && sy < top + 2) {
                  occ = Math.max(occ, smoothstep(r, r * 0.35, dx));
                }
              }
            }
          }
          const was = g.faded.has(i);
          if (occ > 0.01) {
            const f = 1 - occ * 0.94;
            for (const { inst, part } of g.parts) {
              tmpObj.position.set(p.x, p.y + part.y * p.s * f - occ * 2.6, p.z);
              tmpObj.rotation.set(0, p.rot, 0);
              tmpObj.scale.setScalar(p.s * part.s * f);
              tmpObj.updateMatrix();
              inst.setMatrixAt(i, tmpObj.matrix);
              inst.instanceMatrix.needsUpdate = true;
            }
            g.faded.add(i);
          } else if (was) {
            this.restoreInstance(g, i);
            g.faded.delete(i);
          }
        });
      }
    }
  }

  /** Restore every faded instance in these groups to its authored matrix. */
  private restoreFaded(groups: PropGroup[]): void {
    for (const g of groups) {
      if (!g.faded.size) continue;
      for (const i of g.faded) this.restoreInstance(g, i);
      g.faded.clear();
    }
  }

  private restoreInstance(g: PropGroup, i: number): void {
    const p = g.props[i]!;
    for (const { inst, part } of g.parts) {
      tmpObj.position.set(p.x, p.y + part.y * p.s, p.z);
      tmpObj.rotation.set(0, p.rot, 0);
      tmpObj.scale.setScalar(p.s * part.s);
      tmpObj.updateMatrix();
      inst.setMatrixAt(i, tmpObj.matrix);
      inst.instanceMatrix.needsUpdate = true;
    }
  }

  /* ------------------------------------------------------------ far */

  /**
   * Slide the four parallax layers along with the camera.
   *
   * This used to dispose and rebuild all four geometries on every call — every
   * 40 units of travel. Measured over a 20 km flight that was 3,640 of the
   * 4,831 Float32Array allocations (75%) and most of the geometry disposals,
   * plus a computeVertexNormals() per layer per call. The topology is fixed at
   * FAR_SAMPLES, so only the heights are rewritten now and the flight is
   * allocation-free for these layers.
   */
  private rebuildFar(camX: number): void {
    const start = camX - 350;
    const end = camX + 1800;
    for (let layer = 0; layer < 4; layer++) {
      const mesh = this.farMeshes[layer];
      const positions = this.farPos[layer];
      if (!mesh || !positions) continue;
      const amp = 0.55 + layer * 0.22;
      const yOff = -2 + layer * 7;
      const phase = layer * 45 + this.seedN * 0.01;
      for (let i = 0; i <= FAR_SAMPLES; i++) {
        const t = i / FAR_SAMPLES;
        const x = lerp(start, end, t);
        const b = this.biomeAt(x);
        const y =
          yOff +
          amp * 16 * b.amp * Math.sin(x * (0.01 - layer * 0.0018) / b.wave + phase) +
          amp * 8 * Math.sin(x * 0.024 + phase * 1.3) +
          5 * fbm(x * 0.016 + layer, this.seedN + layer * 17, 3);
        // Two verts per sample: the ridge line and its skirt 90 units below.
        const o = i * 6;
        positions[o] = x;
        positions[o + 1] = y;
        positions[o + 2] = 0;
        positions[o + 3] = x;
        positions[o + 4] = y - 90;
        positions[o + 5] = 0;
      }
      // No computeVertexNormals(): farMats are MeshBasicMaterial, which never
      // reads normals, and frustumCulled is already false so no bounding
      // sphere is required either. Both were pure cost.
      (mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

function set3(arr: Float32Array, i: number, x: number, y: number, z: number): void {
  const o = i * 3;
  arr[o] = x;
  arr[o + 1] = y;
  arr[o + 2] = z;
}

function setC(arr: Float32Array, i: number, c: THREE.Color): void {
  const o = i * 3;
  arr[o] = c.r;
  arr[o + 1] = c.g;
  arr[o + 2] = c.b;
}
